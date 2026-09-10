import { SchoolBillingService } from './school-billing.service';

const context = { correlationId: 'billing-correlation', ip: '203.0.113.10', userAgent: 'jest' };
const now = new Date('2026-09-07T00:00:00.000Z');

describe('SchoolBillingService', () => {
  it('archives a plan without rewriting historical invoices', async () => {
    const existing = { id: '11111111-1111-4111-8111-111111111111', slug: 'standard', active: true };
    const tx = { schoolBillingPlan: { findUnique: jest.fn().mockResolvedValue(existing), update: jest.fn().mockResolvedValue({ ...existing, active: false }) }, platformAuditEvent: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await expect(new SchoolBillingService(prisma).updatePlan(existing.id, 'operator-1', { active: false, internalReason: 'Replaced by the 2027 catalogue.' }, context)).resolves.toMatchObject({ active: false });
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.action).toBe('school_billing_plan_updated');
  });

  it('calculates outstanding balance from non-void invoices', async () => {
    const prisma = { customerSchool: { findUnique: jest.fn().mockResolvedValue({
      id: 'school-1', name: 'Bora School', status: 'ACTIVE', currency: 'USD',
      invoices: [
        { amountMinor: 10000, paidMinor: 2500, status: 'PARTIALLY_PAID' },
        { amountMinor: 5000, paidMinor: 0, status: 'VOID' },
      ],
    }) } } as any;
    const result = await new SchoolBillingService(prisma).billing('school-1');
    expect(result.outstandingMinor).toBe(7500);
  });

  it('returns customer-safe billing only through the authenticated account relation', async () => {
    const prisma = { customerSchool: { findMany: jest.fn().mockResolvedValue([{
      id: 'school-1', name: 'Bora School', status: 'ACTIVE', currency: 'USD', billingPlan: null,
      invoices: [
        { id: 'invoice-1', amountMinor: 10000, paidMinor: 2500, status: 'PARTIALLY_PAID', payments: [] },
        { id: 'invoice-2', amountMinor: 5000, paidMinor: 0, status: 'VOID', payments: [] },
      ],
      billingNotifications: [{ id: 'notice-1', invoiceId: 'invoice-1', type: 'DUE_SOON', subject: 'Due soon', message: 'Please pay', createdAt: now, sentAt: null }],
    }]) } } as any;
    const result = await new SchoolBillingService(prisma).customerBilling('account-1');
    expect(prisma.customerSchool.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { installation: { is: { accountId: 'account-1' } } },
    }));
    expect(result[0].outstandingMinor).toBe(7500);
    expect(result[0].notifications[0]).not.toHaveProperty('recipientEmail');
    expect(result[0].notifications[0]).not.toHaveProperty('failureMessage');
  });

  it('suspends only three days after the final overdue notice was created', async () => {
    const invoice = {
      id: 'invoice-1', invoiceNumber: 'WTN-2026-OVERDUE', currency: 'USD', amountMinor: 10000, paidMinor: 0,
      dueAt: new Date('2026-09-01T00:00:00.000Z'), notifications: [{ createdAt: new Date('2026-09-04T00:00:00.000Z') }],
    };
    const prisma = { customerSchool: { findFirst: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', suspendedReason: null, invoices: [invoice] }) } } as any;
    const service = new SchoolBillingService(prisma);
    await expect(service.installationControl('registration-1', new Date('2026-09-06T23:59:59.000Z'))).resolves.toMatchObject({ access: 'ACTIVE' });
    await expect(service.installationControl('registration-1', new Date('2026-09-07T00:00:00.000Z'))).resolves.toMatchObject({ access: 'SUSPENDED' });
  });

  it('never starts suspension grace before a final overdue notice exists', async () => {
    const prisma = { customerSchool: { findFirst: jest.fn().mockResolvedValue({
      id: 'school-1', name: 'Bora School', status: 'ACTIVE', suspendedReason: null,
      invoices: [{ id: 'invoice-1', invoiceNumber: 'WTN-1', currency: 'USD', amountMinor: 10000, paidMinor: 0, dueAt: new Date('2026-01-01'), notifications: [] }],
    }) } } as any;
    await expect(new SchoolBillingService(prisma).installationControl('registration-1', now)).resolves.toMatchObject({ access: 'ACTIVE', warnings: [] });
  });

  it('issues and audits an integer-minor-unit invoice', async () => {
    const invoice = { id: 'invoice-1', invoiceNumber: 'WTN-2026-ABCDE12345', currency: 'USD', amountMinor: 12000, description: 'Annual plan', dueAt: new Date('2026-10-01'), payments: [] };
    const tx = {
      schoolInvoice: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(invoice) },
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', currency: 'USD', contactEmail: 'owner@bora.example' }) },
      platformAuditEvent: { create: jest.fn() },
      schoolBillingNotification: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)), schoolBillingNotification: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await new SchoolBillingService(prisma).issueInvoice('school-1', 'operator-1', {
      currency: 'USD', amountMinor: 12000, description: 'Annual plan', dueAt: '2026-10-01T00:00:00.000Z',
      idempotencyKey: 'invoice-idempotency-0001', internalReason: 'Signed annual renewal.',
    }, context, now);
    expect(tx.schoolInvoice.create.mock.calls[0][0].data).toMatchObject({ customerSchoolId: 'school-1', amountMinor: 12000 });
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.action).toBe('school_invoice_issued');
  });

  it('records a partial payment and advances invoice status', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      schoolPayment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'payment-1', provider: 'manual', providerReference: 'BANK-001', amountMinor: 4000 }),
      },
      schoolInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'WTN-1', currency: 'USD', customerSchoolId: 'school-1', status: 'ISSUED', amountMinor: 10000, paidMinor: 0 }),
        update: jest.fn(),
      },
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ name: 'Bora School', contactEmail: 'owner@bora.example' }) },
      schoolBillingNotification: { create: jest.fn() },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)), schoolBillingNotification: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await new SchoolBillingService(prisma).recordPayment('school-1', 'invoice-1', 'operator-1', {
      provider: 'manual', providerReference: 'BANK-001', amountMinor: 4000, internalReason: 'Bank receipt verified.',
    }, context, now);
    expect(tx.schoolInvoice.update.mock.calls[0][0].data).toMatchObject({ paidMinor: 4000, status: 'PARTIALLY_PAID' });
  });

  it('accepts customer payment evidence only for an invoice owned by that account', async () => {
    const prisma = {
      schoolInvoice: { findFirst: jest.fn().mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', status: 'ISSUED', amountMinor: 10000, paidMinor: 0 }) },
      schoolPaymentSubmission: { create: jest.fn().mockResolvedValue({ id: 'submission-1', status: 'PENDING' }) },
    } as any;
    await expect(new SchoolBillingService(prisma).submitPayment('account-1', {
      invoiceId: '11111111-1111-4111-8111-111111111111', provider: 'bank-transfer', providerReference: 'BANK-100', amountMinor: 10000,
    })).resolves.toMatchObject({ status: 'PENDING' });
    expect(prisma.schoolInvoice.findFirst.mock.calls[0][0].where.school.installation.is.accountId).toBe('account-1');
  });

  it('does not approve customer evidence until the verified payment ledger write succeeds', async () => {
    const submission = { id: '22222222-2222-4222-8222-222222222222', invoiceId: 'invoice-1', status: 'PENDING', provider: 'bank-transfer', providerReference: 'BANK-101', amountMinor: 10000, note: null };
    const prisma = { schoolPaymentSubmission: { findFirst: jest.fn().mockResolvedValue(submission), update: jest.fn() } } as any;
    const service = new SchoolBillingService(prisma);
    jest.spyOn(service, 'recordPayment').mockRejectedValue(new Error('ledger unavailable'));
    await expect(service.decidePaymentSubmission('school-1', submission.id, 'operator-1', true, { internalReason: 'Bank settlement independently verified.' }, context, now)).rejects.toThrow('ledger unavailable');
    expect(prisma.schoolPaymentSubmission.update).not.toHaveBeenCalled();
  });

  it('rejects a payment greater than the remaining balance', async () => {
    const tx = {
      $queryRaw: jest.fn(), schoolPayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      schoolInvoice: { findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', customerSchoolId: 'school-1', status: 'PARTIALLY_PAID', amountMinor: 10000, paidMinor: 8000 }) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await expect(new SchoolBillingService(prisma).recordPayment('school-1', 'invoice-1', 'operator-1', {
      provider: 'manual', providerReference: 'BANK-002', amountMinor: 3000, internalReason: 'Bank receipt verified.',
    }, context, now)).rejects.toMatchObject({ status: 409 });
    expect(tx.schoolPayment.create).not.toHaveBeenCalled();
  });

  it('refuses to void an invoice that has received money', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      schoolInvoice: { findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', customerSchoolId: 'school-1', status: 'PARTIALLY_PAID', paidMinor: 100 }), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await expect(new SchoolBillingService(prisma).voidInvoice('school-1', 'invoice-1', 'operator-1', {
      internalReason: 'Invoice entered in error.',
    }, context, now)).rejects.toMatchObject({ status: 409 });
    expect(tx.schoolInvoice.update).not.toHaveBeenCalled();
  });
});
