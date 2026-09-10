import { createHash } from 'node:crypto';
import { SchoolBillingService } from './school-billing.service';

/**
 * Manual bank payment: the accounts Wattanam receives money into, shown to customer schools beside
 * their bills, and the account a customer names when they submit a payment for review.
 */
const context = { correlationId: 'payment-methods', ip: '203.0.113.20', userAgent: 'jest' };
const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');
const SVG_AS_PNG = 'data:image/png;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
const METHOD_ID = '44444444-4444-4444-8444-444444444444';
const INVOICE_ID = '55555555-5555-4555-8555-555555555555';

const method = {
  label: 'ABA Bank — USD', bankName: 'ABA Bank', accountName: 'Wattanam Co., Ltd.', accountNumber: '000 123 456',
  currency: 'USD', qrImage: PNG, instructions: 'Put the invoice number in the transfer remark.', internalReason: 'Receiving account for USD schools.',
};

describe('SchoolBillingService payment methods (operator)', () => {
  function harness(existing: Record<string, unknown> | null = null) {
    const tx = {
      schoolPaymentMethod: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: METHOD_ID, active: true, position: 0, instructions: null, qrImage: null, ...data })),
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(({ data }: any) => ({ ...existing, ...data })),
      },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    return { tx, prisma };
  }

  it('stores a receiving account with its bank QR code', async () => {
    const { tx, prisma } = harness();
    await new SchoolBillingService(prisma).createPaymentMethod('operator-1', method, context);
    expect(tx.schoolPaymentMethod.create.mock.calls[0][0].data).toMatchObject({ bankName: 'ABA Bank', accountNumber: '000 123 456', currency: 'USD', qrImage: PNG });
  });

  // Replacing the QR customers scan redirects money, so the audit has to show it -- by hash, since
  // the image itself is too large for an audit row.
  it('audits the account by QR hash, never by the image itself', async () => {
    const { tx, prisma } = harness();
    await new SchoolBillingService(prisma).createPaymentMethod('operator-1', method, context);
    const audit = tx.platformAuditEvent.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'school_payment_method_created', targetType: 'SchoolPaymentMethod', targetId: METHOD_ID });
    expect(audit.metadata.qrImageSha256).toBe(createHash('sha256').update(PNG).digest('hex').slice(0, 16));
    expect(JSON.stringify(audit.metadata)).not.toContain('base64');
  });

  it('refuses markup disguised as a PNG QR code', async () => {
    const { tx, prisma } = harness();
    await expect(new SchoolBillingService(prisma).createPaymentMethod('operator-1', { ...method, qrImage: SVG_AS_PNG }, context)).rejects.toThrow(/not a valid PNG/);
    expect(tx.schoolPaymentMethod.create).not.toHaveBeenCalled();
  });

  // Past submissions name the account they were paid into, so accounts are archived, not deleted.
  it('archives an account and audits before and after', async () => {
    const existing = { id: METHOD_ID, ...method, active: true, position: 0 };
    const { tx, prisma } = harness(existing);
    await new SchoolBillingService(prisma).updatePaymentMethod(METHOD_ID, 'operator-1', { active: false, internalReason: 'Account closed by the bank.' }, context);
    expect(tx.schoolPaymentMethod.update.mock.calls[0][0]).toMatchObject({ where: { id: METHOD_ID }, data: { active: false } });
    const audit = tx.platformAuditEvent.create.mock.calls[0][0].data;
    expect(audit.action).toBe('school_payment_method_updated');
    expect(audit.metadata).toMatchObject({ before: { active: true }, after: { active: false } });
  });

  it('refuses an update that changes nothing', async () => {
    const { prisma } = harness({ id: METHOD_ID, ...method });
    await expect(new SchoolBillingService(prisma).updatePaymentMethod(METHOD_ID, 'operator-1', { internalReason: 'No change.' }, context)).rejects.toThrow(/At least one/);
  });

  it('reports an account that does not exist', async () => {
    const { prisma } = harness(null);
    await expect(new SchoolBillingService(prisma).updatePaymentMethod(METHOD_ID, 'operator-1', { active: false, internalReason: 'Closing it.' }, context)).rejects.toThrow(/not found/);
  });
});

describe('SchoolBillingService payment methods (customer view)', () => {
  it('shows each school only the active accounts in its own currency', async () => {
    const prisma = {
      customerSchool: { findMany: jest.fn().mockResolvedValue([
        { id: 'school-usd', name: 'USD School', status: 'ACTIVE', currency: 'USD', billingAnchorAt: null, billingPlan: null, invoices: [], billingNotifications: [] },
        { id: 'school-khr', name: 'KHR School', status: 'ACTIVE', currency: 'KHR', billingAnchorAt: null, billingPlan: null, invoices: [], billingNotifications: [] },
      ]) },
      schoolPaymentMethod: { findMany: jest.fn().mockResolvedValue([{ id: 'm-usd', currency: 'USD', label: 'ABA USD' }, { id: 'm-khr', currency: 'KHR', label: 'ABA KHR' }]) },
    } as any;
    const result: any[] = await new SchoolBillingService(prisma).customerBilling('account-1');
    expect(prisma.schoolPaymentMethod.findMany.mock.calls[0][0].where).toEqual({ active: true, currency: { in: ['USD', 'KHR'] } });
    expect(result.find((school) => school.schoolId === 'school-usd').paymentMethods.map((m: any) => m.id)).toEqual(['m-usd']);
    expect(result.find((school) => school.schoolId === 'school-khr').paymentMethods.map((m: any) => m.id)).toEqual(['m-khr']);
  });

  it('falls back to the plan currency for a school with none of its own', async () => {
    const prisma = {
      customerSchool: { findMany: jest.fn().mockResolvedValue([
        { id: 'school-1', name: 'Plan School', status: 'ACTIVE', currency: null, billingAnchorAt: null, billingPlan: { currency: 'USD' }, invoices: [], billingNotifications: [] },
      ]) },
      schoolPaymentMethod: { findMany: jest.fn().mockResolvedValue([{ id: 'm-usd', currency: 'USD' }]) },
    } as any;
    const result: any[] = await new SchoolBillingService(prisma).customerBilling('account-1');
    expect(result[0].paymentMethods.map((m: any) => m.id)).toEqual(['m-usd']);
  });
});

describe('SchoolBillingService submissions into a receiving account', () => {
  function harness(paymentMethod: Record<string, unknown> | null) {
    return {
      schoolInvoice: { findFirst: jest.fn().mockResolvedValue({ id: INVOICE_ID, status: 'ISSUED', amountMinor: 17000, paidMinor: 0, currency: 'USD' }) },
      schoolPaymentMethod: { findUnique: jest.fn().mockResolvedValue(paymentMethod) },
      schoolPaymentSubmission: { create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'submission-1', ...data })) },
    } as any;
  }
  const submission = { invoiceId: INVOICE_ID, provider: 'bank-transfer', providerReference: 'ABA-778812', amountMinor: 17000, paymentMethodId: METHOD_ID };

  it('records which account the customer paid into, with the receipt', async () => {
    const prisma = harness({ active: true, currency: 'USD' });
    await new SchoolBillingService(prisma).submitPayment('account-1', { ...submission, receiptImage: PNG });
    expect(prisma.schoolPaymentSubmission.create.mock.calls[0][0].data).toMatchObject({ paymentMethodId: METHOD_ID, receiptImage: PNG, accountId: 'account-1' });
  });

  // The customer already has the receipt, and it is by far the heaviest field on the row.
  it('does not echo the receipt image back', async () => {
    const prisma = harness({ active: true, currency: 'USD' });
    await new SchoolBillingService(prisma).submitPayment('account-1', { ...submission, receiptImage: PNG });
    expect(prisma.schoolPaymentSubmission.create.mock.calls[0][0].select).toBeDefined();
    expect(prisma.schoolPaymentSubmission.create.mock.calls[0][0].select.receiptImage).toBeUndefined();
  });

  it('refuses an archived account', async () => {
    const prisma = harness({ active: false, currency: 'USD' });
    await expect(new SchoolBillingService(prisma).submitPayment('account-1', submission)).rejects.toThrow(/no longer accepting payments/);
  });

  it('refuses an account in a different currency from the invoice', async () => {
    const prisma = harness({ active: true, currency: 'KHR' });
    await expect(new SchoolBillingService(prisma).submitPayment('account-1', submission)).rejects.toThrow(/takes KHR; this invoice is in USD/);
  });

  it('refuses a receipt that is not really an image', async () => {
    const prisma = harness({ active: true, currency: 'USD' });
    await expect(new SchoolBillingService(prisma).submitPayment('account-1', { ...submission, receiptImage: SVG_AS_PNG })).rejects.toThrow(/not a valid PNG/);
    expect(prisma.schoolPaymentSubmission.create).not.toHaveBeenCalled();
  });

  // Clients that predate payment methods send neither field and must keep working.
  it('still accepts a submission that names no account', async () => {
    const prisma = harness(null);
    const { paymentMethodId: _omitted, ...plain } = submission;
    await new SchoolBillingService(prisma).submitPayment('account-1', plain);
    expect(prisma.schoolPaymentMethod.findUnique).not.toHaveBeenCalled();
    expect(prisma.schoolPaymentSubmission.create).toHaveBeenCalled();
  });
});

describe('SchoolBillingService payment methods reach the school itself', () => {
  it('includes the school-currency accounts in the synced billing summary, capped', async () => {
    const prisma = {
      customerSchool: { findFirst: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', suspendedReason: null, currency: 'USD', billingPlan: null, billingNotifications: [], invoices: [] }) },
      schoolPaymentMethod: { findMany: jest.fn().mockResolvedValue([{ id: 'm-usd', currency: 'USD' }]) },
    } as any;
    const control: any = await new SchoolBillingService(prisma).installationControl('registration-1');
    expect(prisma.schoolPaymentMethod.findMany.mock.calls[0][0]).toMatchObject({ where: { active: true, currency: { in: ['USD'] } }, take: 5 });
    expect(control.billing.paymentMethods).toEqual([{ id: 'm-usd', currency: 'USD' }]);
  });
});

describe('SchoolBillingService confirming a received payment', () => {
  // Most customers leave the note empty. Confirming their payment used to fail validation, because
  // the stored null note was handed to recordPayment, which accepts a string or nothing.
  it('confirms a submission that has no note', async () => {
    const submission = { id: 'submission-1', invoiceId: INVOICE_ID, status: 'PENDING', provider: 'bank-transfer', providerReference: 'ABA-778812', amountMinor: 17000, note: null };
    const tx = { schoolPaymentSubmission: { update: jest.fn().mockResolvedValue({ ...submission, status: 'APPROVED' }) }, platformAuditEvent: { create: jest.fn() } };
    const prisma = { schoolPaymentSubmission: { findFirst: jest.fn().mockResolvedValue(submission) }, $transaction: jest.fn((work: any) => work(tx)) } as any;
    const service = new SchoolBillingService(prisma);
    const recordPayment = jest.spyOn(service, 'recordPayment').mockResolvedValue({} as any);
    await service.decidePaymentSubmission('school-1', 'submission-1', 'operator-1', true, { internalReason: 'Seen on the ABA statement.' }, context);
    const value: any = recordPayment.mock.calls[0][3];
    expect(value).toMatchObject({ providerReference: 'ABA-778812', amountMinor: 17000 });
    expect(value.note).toBeUndefined();
  });
});
