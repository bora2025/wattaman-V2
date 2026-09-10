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
    const prisma = { schoolPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) }, customerSchool: { findMany: jest.fn().mockResolvedValue([{
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
    const prisma = { schoolPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) }, customerSchool: { findFirst: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', suspendedReason: null, invoices: [invoice] }) } } as any;
    const service = new SchoolBillingService(prisma);
    await expect(service.installationControl('registration-1', new Date('2026-09-06T23:59:59.000Z'))).resolves.toMatchObject({ access: 'ACTIVE' });
    await expect(service.installationControl('registration-1', new Date('2026-09-07T00:00:00.000Z'))).resolves.toMatchObject({ access: 'SUSPENDED' });
  });

  it('never starts suspension grace before a final overdue notice exists', async () => {
    const prisma = { schoolPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) }, customerSchool: { findFirst: jest.fn().mockResolvedValue({
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
      $executeRaw: jest.fn(),
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
      $executeRaw: jest.fn(), schoolPayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
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
      $executeRaw: jest.fn(),
      schoolInvoice: { findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', customerSchoolId: 'school-1', status: 'PARTIALLY_PAID', paidMinor: 100 }), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await expect(new SchoolBillingService(prisma).voidInvoice('school-1', 'invoice-1', 'operator-1', {
      internalReason: 'Invoice entered in error.',
    }, context, now)).rejects.toMatchObject({ status: 409 });
    expect(tx.schoolInvoice.update).not.toHaveBeenCalled();
  });
});

/**
 * Invoice lines. A school invoice used to be one description and one amount, so a bill could not
 * show a subscription and a plugin purchase side by side.
 */
describe('SchoolBillingService invoice lines', () => {
  function harness(school: Record<string, unknown> = {}) {
    const tx = {
      schoolInvoice: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'invoice-1', invoiceNumber: 'WTN-2026-AAAA', ...data, payments: [], lines: [] })) },
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', currency: 'USD', contactEmail: 'owner@bora.example', ...school }) },
      platformAuditEvent: { create: jest.fn() },
      schoolBillingNotification: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)), schoolBillingNotification: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    return { tx, prisma };
  }
  const lineData = (tx: any) => tx.schoolInvoice.create.mock.calls[0][0].data.lines.create;

  it('totals an invoice from its lines', async () => {
    const { tx, prisma } = harness();
    await new SchoolBillingService(prisma).issueInvoice('school-1', 'operator-1', {
      currency: 'USD', description: 'September charges', dueAt: '2026-10-01T00:00:00.000Z',
      lines: [
        { kind: 'SUBSCRIPTION', description: 'Standard (monthly)', unitAmountMinor: 5000 },
        { kind: 'PLUGIN', description: 'Attendance Pro', quantity: 2, unitAmountMinor: 6000 },
      ],
      idempotencyKey: 'invoice-idempotency-0002', internalReason: 'September billing run.',
    }, context, now);

    expect(tx.schoolInvoice.create.mock.calls[0][0].data.amountMinor).toBe(17000);
    expect(lineData(tx)).toEqual([
      expect.objectContaining({ position: 0, kind: 'SUBSCRIPTION', amountMinor: 5000, quantity: 1 }),
      expect.objectContaining({ position: 1, kind: 'PLUGIN', amountMinor: 12000, quantity: 2 }),
    ]);
  });

  // The client may state a total; it is a check value, never the source of truth.
  it('refuses a stated total that disagrees with the lines', async () => {
    const { prisma } = harness();
    await expect(new SchoolBillingService(prisma).issueInvoice('school-1', 'operator-1', {
      currency: 'USD', amountMinor: 9900, description: 'September charges', dueAt: '2026-10-01T00:00:00.000Z',
      lines: [{ kind: 'SUBSCRIPTION', description: 'Standard (monthly)', unitAmountMinor: 5000 }],
      idempotencyKey: 'invoice-idempotency-0003', internalReason: 'September billing run.',
    }, context, now)).rejects.toThrow(/does not match the sum of its lines/);
  });

  // Every read path can then assume a breakdown exists, with no line-less special case.
  it('gives a single-amount invoice one line so no invoice is line-less', async () => {
    const { tx, prisma } = harness();
    await new SchoolBillingService(prisma).issueInvoice('school-1', 'operator-1', {
      currency: 'USD', amountMinor: 12000, description: 'Setup fee', dueAt: '2026-10-01T00:00:00.000Z',
      idempotencyKey: 'invoice-idempotency-0004', internalReason: 'One-off onboarding work.',
    }, context, now);

    expect(lineData(tx)).toEqual([expect.objectContaining({ position: 0, kind: 'ADJUSTMENT', description: 'Setup fee', amountMinor: 12000 })]);
  });

  it('refuses an invoice in a currency the school is not billed in', async () => {
    const { prisma } = harness({ currency: 'KHR' });
    await expect(new SchoolBillingService(prisma).issueInvoice('school-1', 'operator-1', {
      currency: 'USD', amountMinor: 5000, description: 'Standard (monthly)', dueAt: '2026-10-01T00:00:00.000Z',
      idempotencyKey: 'invoice-idempotency-0005', internalReason: 'September billing run.',
    }, context, now)).rejects.toThrow(/must be KHR/);
  });
});

describe('SchoolBillingService plan invoices', () => {
  type Plan = { id: string; slug: string; name: string; currency: string; amountMinor: number; billingInterval: 'MONTHLY' | 'ANNUAL'; dueDays: number; active: boolean };
  const plan: Plan = { id: 'plan-1', slug: 'standard', name: 'Standard', currency: 'USD', amountMinor: 5000, billingInterval: 'MONTHLY', dueDays: 14, active: true };

  function harness(billingPlan: Plan | null = plan) {
    const tx = {
      schoolInvoice: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'invoice-1', invoiceNumber: 'WTN-2026-AAAA', ...data, payments: [], lines: [] })) },
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', currency: 'USD', contactEmail: 'owner@bora.example' }) },
      platformAuditEvent: { create: jest.fn() },
      schoolBillingNotification: { create: jest.fn() },
    };
    const prisma = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', billingPlan }) },
      marketplaceOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((work: any) => work(tx)),
      schoolBillingNotification: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    return { tx, prisma };
  }

  /**
   * The bug this closes: dueAt was computed from now(), so back-issuing January's invoice in March
   * dated it from March and quietly handed a late invoice a full fresh grace period.
   */
  it('dates the invoice from the period it covers, not from today', async () => {
    const { tx, prisma } = harness();
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-01-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000001', internalReason: 'January billing run.',
    }, context);

    const data = tx.schoolInvoice.create.mock.calls[0][0].data;
    expect(data.dueAt.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(data.periodEnd.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  // The period guard the database enforces: one live invoice per school per plan period.
  it('stamps the period so a second invoice for it cannot be stored', async () => {
    const { tx, prisma } = harness();
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000002', internalReason: 'September billing run.',
    }, context);

    expect(tx.schoolInvoice.create.mock.calls[0][0].data.periodKey).toBe('plan-1:2026-09-01T00:00:00.000Z');
  });

  it('carries the subscription as a line of its own', async () => {
    const { tx, prisma } = harness();
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000003', internalReason: 'September billing run.',
    }, context);

    expect(tx.schoolInvoice.create.mock.calls[0][0].data.lines.create).toEqual([
      expect.objectContaining({ kind: 'SUBSCRIPTION', description: 'Standard (monthly)', amountMinor: 5000, billingPlanId: 'plan-1' }),
    ]);
  });

  it('spans a year for an annual plan', async () => {
    const { tx, prisma } = harness({ ...plan, billingInterval: 'ANNUAL' });
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000004', internalReason: 'Annual billing run.',
    }, context);

    expect(tx.schoolInvoice.create.mock.calls[0][0].data.periodEnd.toISOString()).toBe('2027-09-01T00:00:00.000Z');
  });

  it('refuses to invoice a school with no active plan', async () => {
    const { prisma } = harness(null);
    await expect(new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000005', internalReason: 'September billing run.',
    }, context)).rejects.toThrow(/active central billing plan/);
  });
});

describe('SchoolBillingService voiding', () => {
  // periodKey is nullable precisely so that voiding a month releases it to be billed again.
  it('releases the billing period when an invoice is voided', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      schoolInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'WTN-1', customerSchoolId: 'school-1', status: 'ISSUED', paidMinor: 0, lines: [] }),
        update: jest.fn().mockResolvedValue({ id: 'invoice-1', status: 'VOID', voidedAt: now }),
      },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await new SchoolBillingService(prisma).voidInvoice('school-1', 'invoice-1', 'operator-1', { internalReason: 'Issued against the wrong school.' }, context, now);

    expect(tx.schoolInvoice.update.mock.calls[0][0].data).toMatchObject({ status: 'VOID', periodKey: null });
  });
});

/**
 * The recurring billing run. Before this, a monthly plan meant a person clicking once per school
 * per month, forever, and remembering which schools they had already done.
 */
describe('SchoolBillingService recurring billing cycle', () => {
  const plan = { id: 'plan-1', slug: 'standard', name: 'Standard', currency: 'USD', amountMinor: 5000, billingInterval: 'MONTHLY', dueDays: 14, active: true };

  function harness(schools: Array<Record<string, unknown>>, existingPeriodKeys: string[] = []) {
    const created: any[] = [];
    const tx = {
      schoolInvoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => { created.push(data); return { id: `invoice-${created.length}`, invoiceNumber: 'WTN-X', ...data, payments: [], lines: [] }; }),
      },
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', currency: 'USD', contactEmail: 'owner@bora.example' }) },
      platformAuditEvent: { create: jest.fn() },
      schoolBillingNotification: { create: jest.fn() },
    };
    const prisma = {
      customerSchool: {
        findMany: jest.fn().mockResolvedValue(schools),
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', billingPlan: plan }),
      },
      schoolInvoice: { findFirst: jest.fn().mockImplementation(({ where }: any) => (existingPeriodKeys.includes(where.periodKey) ? { id: 'existing' } : null)) },
      marketplaceOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((work: any) => work(tx)),
      schoolBillingNotification: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    return { prisma, created };
  }

  const school = (over: Record<string, unknown> = {}) => ({ id: 'school-1', name: 'Bora School', billingAnchorAt: new Date('2026-01-15T00:00:00.000Z'), billingPlan: plan, ...over });

  it('issues every period that has started and none that has not', async () => {
    const { prisma, created } = harness([school()]);
    const result = await new SchoolBillingService(prisma).runBillingCycle(new Date('2026-03-20T00:00:00.000Z'));

    // Jan 15, Feb 15, Mar 15 have started. Apr 15 has not.
    expect(result.issued).toBe(3);
    expect(created.map((data) => data.periodStart.toISOString())).toEqual([
      '2026-01-15T00:00:00.000Z', '2026-02-15T00:00:00.000Z', '2026-03-15T00:00:00.000Z',
    ]);
  });

  // Running twice must not bill twice: this runs hourly and on every boot.
  it('skips a period that has already been invoiced', async () => {
    const { prisma, created } = harness([school()], ['plan-1:2026-01-15T00:00:00.000Z', 'plan-1:2026-02-15T00:00:00.000Z']);
    const result = await new SchoolBillingService(prisma).runBillingCycle(new Date('2026-03-20T00:00:00.000Z'));

    expect(result.alreadyBilled).toBe(2);
    expect(created.map((data) => data.periodStart.toISOString())).toEqual(['2026-03-15T00:00:00.000Z']);
  });

  it('marks what it raised as scheduled rather than attributing it to a person', async () => {
    const { prisma, created } = harness([school()]);
    await new SchoolBillingService(prisma).runBillingCycle(new Date('2026-01-20T00:00:00.000Z'));

    expect(created[0].origin).toBe('SCHEDULED');
    expect(created[0].createdByOperatorId).toBeNull();
  });

  /**
   * A 31st-of-the-month anchor is where naive period arithmetic breaks: adding one month to
   * 31 January gives 3 March in JavaScript, and repeating that walks the anniversary forward a few
   * days every year. Each period is derived from the anchor directly instead.
   */
  it('keeps a month-end anniversary pinned instead of drifting', async () => {
    const { prisma, created } = harness([school({ billingAnchorAt: new Date('2026-01-31T00:00:00.000Z') })]);
    await new SchoolBillingService(prisma).runBillingCycle(new Date('2026-04-05T00:00:00.000Z'));

    expect(created.map((data) => data.periodStart.toISOString().slice(0, 10))).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31',
    ]);
  });

  it('bills an annual plan once a year, not twelve times', async () => {
    const annual = { ...plan, billingInterval: 'ANNUAL' };
    const { prisma, created } = harness([school({ billingPlan: annual })]);
    (prisma.customerSchool.findUnique as jest.Mock).mockResolvedValue({ id: 'school-1', billingPlan: annual });
    await new SchoolBillingService(prisma).runBillingCycle(new Date('2027-06-01T00:00:00.000Z'));

    expect(created.map((data) => data.periodStart.toISOString().slice(0, 10))).toEqual(['2026-01-15', '2027-01-15']);
  });

  // Only ACTIVE schools with an active plan and an anchor are selected -- a suspended school has
  // lost access to the panel where it would see a bill, so accruing one silently is a trap.
  it('asks only for active schools that have an anchor and an active plan', async () => {
    const { prisma } = harness([]);
    await new SchoolBillingService(prisma).runBillingCycle(new Date('2026-03-20T00:00:00.000Z'));

    expect(prisma.customerSchool.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'ACTIVE', billingAnchorAt: { not: null }, billingPlan: { is: { active: true } } },
    }));
  });

  it('keeps going when one school fails', async () => {
    const { prisma } = harness([school(), school({ id: 'school-2' })]);
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('deadlock'));
    const result = await new SchoolBillingService(prisma).runBillingCycle(new Date('2026-01-20T00:00:00.000Z'));

    expect(result.failed).toBe(1);
    expect(result.issued).toBe(1);
  });
});

describe('SchoolBillingService billing anchor', () => {
  function harness(school: Record<string, unknown>) {
    const tx = {
      schoolBillingPlan: { findUnique: jest.fn().mockResolvedValue({ id: 'plan-1', slug: 'standard', currency: 'USD', billingInterval: 'MONTHLY', active: true }) },
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'ACTIVE', currency: 'USD', ...school }), update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'school-1', ...data })) },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    return { tx, prisma };
  }

  it('anchors a school that has never been billed', async () => {
    const { tx, prisma } = harness({ billingAnchorAt: null });
    await new SchoolBillingService(prisma).assignPlan('school-1', 'operator-1', {
      planId: '11111111-1111-4111-8111-111111111111', billingAnchorAt: '2026-09-01T00:00:00.000Z', internalReason: 'New customer.',
    }, context);

    expect(tx.customerSchool.update.mock.calls[0][0].data.billingAnchorAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  // Changing plan changes the price from the next period; it does not restart the billing year.
  it('keeps the existing anniversary when a plan is changed', async () => {
    const existing = new Date('2026-03-05T00:00:00.000Z');
    const { tx, prisma } = harness({ billingAnchorAt: existing });
    await new SchoolBillingService(prisma).assignPlan('school-1', 'operator-1', {
      planId: '11111111-1111-4111-8111-111111111111', billingAnchorAt: '2026-09-01T00:00:00.000Z', internalReason: 'Upgraded plan.',
    }, context);

    expect(tx.customerSchool.update.mock.calls[0][0].data.billingAnchorAt.toISOString()).toBe(existing.toISOString());
  });

  // A mistyped year would have the run raise a dozen invoices to a real customer.
  it('refuses an anchor far in the past', async () => {
    const { prisma } = harness({ billingAnchorAt: null });
    await expect(new SchoolBillingService(prisma).assignPlan('school-1', 'operator-1', {
      planId: '11111111-1111-4111-8111-111111111111', billingAnchorAt: '2019-01-01T00:00:00.000Z', internalReason: 'Typo.',
    }, context)).rejects.toThrow(/more than one monthly period in the past/);
  });
});

/**
 * Buying a plugin on the school's invoice. The entitlement is granted at approval and the charge
 * lands on the next subscription invoice -- credit, bounded by the rules below.
 * See docs/decisions/school-invoice-plugin-credit-2026-09-10.md.
 */
describe('SchoolBillingService plugin charges on the school invoice', () => {
  const plan = { id: 'plan-1', slug: 'standard', name: 'Standard', currency: 'USD', amountMinor: 5000, billingInterval: 'MONTHLY', dueDays: 14, active: true };

  function harness(unbilled: Array<Record<string, unknown>> = []) {
    const tx = {
      schoolInvoice: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'invoice-1', invoiceNumber: 'WTN-2026-AAAA', ...data, payments: [], lines: [] })) },
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Bora School', status: 'ACTIVE', currency: 'USD', contactEmail: 'owner@bora.example' }) },
      platformAuditEvent: { create: jest.fn() },
      schoolBillingNotification: { create: jest.fn() },
    };
    const prisma = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', billingPlan: plan }) },
      marketplaceOrderLine: { findMany: jest.fn().mockResolvedValue(unbilled) },
      $transaction: jest.fn((work: any) => work(tx)),
      schoolBillingNotification: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    return { tx, prisma };
  }

  const LINE_A = '22222222-2222-4222-8222-222222222222';
  const LINE_B = '33333333-3333-4333-8333-333333333333';
  const orderLine = (id: string, name: string, unitPriceMinor: number) => ({ id, unitPriceMinor, plugin: { name } });

  it('adds unbilled plugin purchases to the next subscription invoice', async () => {
    const { tx, prisma } = harness([orderLine(LINE_A, 'Attendance Pro', 12000), orderLine(LINE_B, 'Report Builder', 8000)]);
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000010', internalReason: 'September billing run.',
    }, context);

    const data = tx.schoolInvoice.create.mock.calls[0][0].data;
    expect(data.amountMinor).toBe(25000);
    expect(data.lines.create.map((line: any) => [line.kind, line.description, line.amountMinor])).toEqual([
      ['SUBSCRIPTION', 'Standard (monthly)', 5000],
      ['PLUGIN', 'Attendance Pro (plugin licence)', 12000],
      ['PLUGIN', 'Report Builder (plugin licence)', 8000],
    ]);
  });

  // The link is what makes a purchase billable exactly once; the column is unique.
  it('records which purchase each plugin line came from', async () => {
    const { tx, prisma } = harness([orderLine(LINE_A, 'Attendance Pro', 12000)]);
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000011', internalReason: 'September billing run.',
    }, context);

    expect(tx.schoolInvoice.create.mock.calls[0][0].data.lines.create[1].sourceOrderLineId).toBe(LINE_A);
  });

  it('collects only purchases made on account, in the school currency, that are not already billed', async () => {
    const { prisma } = harness();
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000012', internalReason: 'September billing run.',
    }, context);

    expect(prisma.marketplaceOrderLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        invoiceLine: { is: null },
        order: { is: { settlementMode: 'INVOICE', status: { not: 'CANCELLED' }, currency: 'USD', installation: { is: { customerSchoolId: 'school-1' } } } },
      },
    }));
  });

  it('bills only the subscription when nothing was bought on account', async () => {
    const { tx, prisma } = harness([]);
    await new SchoolBillingService(prisma).issuePlanInvoice('school-1', 'operator-1', {
      periodStart: '2026-09-01T00:00:00.000Z', idempotencyKey: 'plan-invoice-000000013', internalReason: 'September billing run.',
    }, context);

    expect(tx.schoolInvoice.create.mock.calls[0][0].data.lines.create).toHaveLength(1);
  });
});

describe('SchoolBillingService voiding an invoice that granted credit', () => {
  function harness(lines: Array<Record<string, unknown>>, entitlement: Record<string, unknown> | null) {
    const tx = {
      $executeRaw: jest.fn(),
      schoolInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'WTN-2026-AAAA', customerSchoolId: 'school-1', status: 'ISSUED', paidMinor: 0, lines }),
        update: jest.fn().mockResolvedValue({ id: 'invoice-1', status: 'VOID', voidedAt: now }),
      },
      installationEntitlement: { findFirst: jest.fn().mockResolvedValue(entitlement), update: jest.fn() },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    return { tx, prisma };
  }

  // The other half of the credit deal: cancel the bill, cancel the licence it paid for.
  it('revokes the entitlement a voided invoice paid for', async () => {
    const { tx, prisma } = harness([{ id: 'line-1', description: 'Attendance Pro (plugin licence)', sourceOrderLineId: 'order-line-1' }], { id: 'entitlement-1' });
    await new SchoolBillingService(prisma).voidInvoice('school-1', 'invoice-1', 'operator-1', { internalReason: 'Raised against the wrong school.' }, context, now);

    expect(tx.installationEntitlement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entitlement-1' },
      data: expect.objectContaining({ status: 'REVOKED', revokedReason: 'Invoice WTN-2026-AAAA was voided' }),
    }));
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.metadata.revokedEntitlements).toEqual(['entitlement-1']);
  });

  it('leaves a subscription-only invoice with nothing to revoke', async () => {
    const { tx, prisma } = harness([], null);
    await new SchoolBillingService(prisma).voidInvoice('school-1', 'invoice-1', 'operator-1', { internalReason: 'Duplicate.' }, context, now);

    expect(tx.installationEntitlement.update).not.toHaveBeenCalled();
  });

  // An entitlement already revoked or expired is not resurrected only to be revoked again.
  it('does nothing when the entitlement is no longer active', async () => {
    const { tx, prisma } = harness([{ id: 'line-1', description: 'Attendance Pro (plugin licence)', sourceOrderLineId: 'order-line-1' }], null);
    await new SchoolBillingService(prisma).voidInvoice('school-1', 'invoice-1', 'operator-1', { internalReason: 'Already refunded.' }, context, now);

    expect(tx.installationEntitlement.update).not.toHaveBeenCalled();
    expect(tx.schoolInvoice.update).toHaveBeenCalled();
  });
});
