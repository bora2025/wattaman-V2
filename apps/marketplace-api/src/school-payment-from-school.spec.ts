import { generateKeyPairSync, sign } from 'node:crypto';
import { InstallationEntitlementAccessService, schoolPaymentSignedPayload } from './installation-entitlement-access.service';
import { SchoolBillingService } from './school-billing.service';
import { canonicalJson } from './signing';

/**
 * A school reporting a payment from its own admin panel, signed with its installation key rather
 * than through a marketplace session -- so a school with no marketplace account can still say it paid.
 */
const INSTALLATION = '11111111-1111-4111-8111-111111111111';
const INVOICE = '55555555-5555-4555-8555-555555555555';
const METHOD = '44444444-4444-4444-8444-444444444444';
const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');
const OTHER_PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(33)]).toString('base64');

describe('school-signed payment submissions: authentication', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const now = new Date('2026-09-10T10:00:00.000Z');
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = { invoiceId: INVOICE, provider: 'bank-transfer', providerReference: 'ABA-778812', amountMinor: 5000, paymentMethodId: METHOD, receiptImage: PNG, submittedBy: 'Sokha (SUPER_ADMIN)' };
  const signed = () => sign(null, Buffer.from(canonicalJson(schoolPaymentSignedPayload(INSTALLATION, ts, body))), privateKey).toString('base64');
  const prismaWith = (schoolStatus = 'ACTIVE') => ({
    installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', keys: [{ publicKeyPem }], school: { status: schoolStatus } }) },
  }) as any;

  it('accepts a submission signed by the school installation key', async () => {
    await expect(new InstallationEntitlementAccessService(prismaWith()).authenticateSchoolPayment({ installationId: INSTALLATION, ts, signature: signed() }, body, now))
      .resolves.toEqual({ registrationId: 'registration-1' });
  });

  // The signature covers every field, so nothing in between can change what the school reported.
  it('refuses the same signature over a different amount', async () => {
    await expect(new InstallationEntitlementAccessService(prismaWith()).authenticateSchoolPayment({ installationId: INSTALLATION, ts, signature: signed() }, { ...body, amountMinor: 1 }, now))
      .rejects.toThrow(/Signature is invalid/);
  });

  it('refuses the same signature with a different receipt attached', async () => {
    await expect(new InstallationEntitlementAccessService(prismaWith()).authenticateSchoolPayment({ installationId: INSTALLATION, ts, signature: signed() }, { ...body, receiptImage: OTHER_PNG }, now))
      .rejects.toThrow(/Signature is invalid/);
  });

  // Like the bill sync: a suspended school is exactly the one that needs to pay.
  it('lets a suspended school submit', async () => {
    await expect(new InstallationEntitlementAccessService(prismaWith('SUSPENDED')).authenticateSchoolPayment({ installationId: INSTALLATION, ts, signature: signed() }, body, now))
      .resolves.toEqual({ registrationId: 'registration-1' });
  });

  it('refuses a request outside the freshness window', async () => {
    const later = new Date(now.getTime() + 10 * 60 * 1000);
    await expect(new InstallationEntitlementAccessService(prismaWith()).authenticateSchoolPayment({ installationId: INSTALLATION, ts, signature: signed() }, body, later))
      .rejects.toThrow(/freshness window/);
  });
});

describe('school-signed payment submissions: recording', () => {
  const invoice = { id: INVOICE, status: 'ISSUED', amountMinor: 5000, paidMinor: 0, currency: 'USD' };
  function harness(registration: Record<string, unknown> | null, found: Record<string, unknown> | null = invoice) {
    return {
      installationRegistration: { findUnique: jest.fn().mockResolvedValue(registration) },
      schoolInvoice: { findFirst: jest.fn().mockResolvedValue(found) },
      schoolPaymentMethod: { findUnique: jest.fn().mockResolvedValue({ active: true, currency: 'USD' }) },
      schoolPaymentSubmission: { create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'submission-1', ...data })) },
    } as any;
  }
  const input = { invoiceId: INVOICE, provider: 'bank-transfer', providerReference: 'ABA-778812', amountMinor: 5000, paymentMethodId: METHOD, submittedBy: 'Sokha (SUPER_ADMIN)' };

  it('records it as sent from the school, with who sent it', async () => {
    const prisma = harness({ id: 'registration-1', accountId: 'account-1', customerSchoolId: 'school-1' });
    await new SchoolBillingService(prisma).submitPaymentFromSchool('registration-1', input);
    expect(prisma.schoolPaymentSubmission.create.mock.calls[0][0].data).toMatchObject({
      source: 'SCHOOL', installationRegistrationId: 'registration-1', submittedBy: 'Sokha (SUPER_ADMIN)', accountId: 'account-1', paymentMethodId: METHOD,
    });
  });

  // An operator-provisioned school may never have a marketplace account.
  it('works for a school with no marketplace account', async () => {
    const prisma = harness({ id: 'registration-1', accountId: null, customerSchoolId: 'school-1' });
    await new SchoolBillingService(prisma).submitPaymentFromSchool('registration-1', input);
    expect(prisma.schoolPaymentSubmission.create.mock.calls[0][0].data.accountId).toBeNull();
  });

  // Scoped to the school the key belongs to: one school cannot report against another's invoice.
  it("looks for the invoice only among this school's own", async () => {
    const prisma = harness({ id: 'registration-1', accountId: null, customerSchoolId: 'school-1' });
    await new SchoolBillingService(prisma).submitPaymentFromSchool('registration-1', input);
    expect(prisma.schoolInvoice.findFirst.mock.calls[0][0].where).toEqual({ id: INVOICE, customerSchoolId: 'school-1' });
  });

  it("reports another school's invoice as not found", async () => {
    const prisma = harness({ id: 'registration-1', accountId: null, customerSchoolId: 'school-1' }, null);
    await expect(new SchoolBillingService(prisma).submitPaymentFromSchool('registration-1', input)).rejects.toThrow(/not found/);
    expect(prisma.schoolPaymentSubmission.create).not.toHaveBeenCalled();
  });

  it('refuses an installation that is not linked to a customer school', async () => {
    const prisma = harness({ id: 'registration-1', accountId: null, customerSchoolId: null });
    await expect(new SchoolBillingService(prisma).submitPaymentFromSchool('registration-1', input)).rejects.toThrow(/not linked to a customer school/);
  });

  // Portal submissions keep working exactly as before, now labelled as such.
  it('labels a portal submission as PORTAL', async () => {
    const prisma = harness(null);
    const { submittedBy: _omitted, ...portal } = input;
    await new SchoolBillingService(prisma).submitPayment('account-1', portal);
    expect(prisma.schoolPaymentSubmission.create.mock.calls[0][0].data).toMatchObject({ source: 'PORTAL', accountId: 'account-1' });
  });
});
