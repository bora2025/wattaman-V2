import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, sign } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';
import { DisabledTransactionalEmailService, TransactionalEmailService } from './transactional-email.service';
import { recordSaleEntries } from './publisher-governance.service';
import { MAX_QR_IMAGE_BYTES, MAX_RECEIPT_IMAGE_BYTES, validateImageDataUrl } from './payment-image';
import { MarketplaceConfig } from './config';
import { issueTerminalEntitlement } from './entitlement';
import { canonicalJson } from './signing';

const reason = z.string().trim().min(3).max(5000);

/**
 * CREDIT exists in the database enum but is deliberately not accepted here yet. A credit note has
 * to be a negative amount, and every balance in this service -- the outstanding sum, the dunning
 * sweep, the suspension gate -- currently assumes invoice totals are positive. Making them signed
 * is its own piece of work, not a line kind smuggled in with this one.
 */
const invoiceLineInput = z.object({
  kind: z.enum(['SUBSCRIPTION', 'PLUGIN', 'ADJUSTMENT']).default('ADJUSTMENT'),
  description: z.string().trim().min(3).max(2000),
  quantity: z.number().int().positive().max(10_000).default(1),
  unitAmountMinor: z.number().int().positive().max(2_000_000_000),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  /** The plugin order line this charge came from. Unique, so one purchase cannot be billed twice. */
  sourceOrderLineId: z.string().uuid().optional(),
}).strict();

const invoiceInput = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  // Optional only when `lines` is given, in which case the lines are the source of truth and this
  // is a client-supplied check value. The refine below keeps the old single-amount form working.
  amountMinor: z.number().int().positive().max(2_000_000_000).optional(),
  description: z.string().trim().min(3).max(2000),
  dueAt: z.coerce.date(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  lines: z.array(invoiceLineInput).min(1).max(100).optional(),
  idempotencyKey: z.string().min(16).max(200),
  internalReason: reason,
}).strict().refine((value) => !value.periodStart || !value.periodEnd || value.periodEnd > value.periodStart, {
  message: 'periodEnd must be after periodStart', path: ['periodEnd'],
}).refine((value) => value.amountMinor !== undefined || (value.lines && value.lines.length > 0), {
  message: 'Provide amountMinor, lines, or both', path: ['amountMinor'],
});

const paymentInput = z.object({
  provider: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,39}$/),
  providerReference: z.string().trim().min(3).max(200),
  amountMinor: z.number().int().positive().max(2_000_000_000),
  receivedAt: z.coerce.date().optional(),
  note: z.string().trim().max(2000).optional(),
  internalReason: reason,
}).strict();

const voidInput = z.object({ internalReason: reason }).strict();
const notifyInput = z.object({ internalReason: reason }).strict();
const planInput = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), name: z.string().trim().min(2).max(120),
  currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().positive().max(2_000_000_000),
  billingInterval: z.enum(['MONTHLY', 'ANNUAL']), dueDays: z.number().int().min(1).max(90).default(14),
  active: z.boolean().default(true), internalReason: reason,
}).strict();
const planUpdateInput = planInput.partial().extend({ internalReason: reason }).strict();
const assignPlanInput = z.object({
  planId: z.string().uuid(),
  /** Where the subscription renews from. Defaults to the start of today, UTC. */
  billingAnchorAt: z.coerce.date().optional(),
  internalReason: reason,
}).strict();
const planInvoiceInput = z.object({ periodStart: z.coerce.date(), idempotencyKey: z.string().min(16).max(200), internalReason: reason }).strict();
const paymentSubmissionInput = z.object({
  invoiceId: z.string().uuid(), provider: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,39}$/),
  providerReference: z.string().trim().min(3).max(200), amountMinor: z.number().int().positive().max(2_000_000_000),
  note: z.string().trim().max(2000).optional(),
  /** Which receiving account the money went into. Optional so older clients keep working. */
  paymentMethodId: z.string().uuid().optional(),
  /** The customer's transfer receipt; its bytes are checked in submitPayment, this only bounds the text. */
  receiptImage: z.string().max(260_000).optional(),
}).strict();
const paymentSubmissionDecision = z.object({ internalReason: reason, rejectionReason: z.string().trim().min(3).max(2000).optional() }).strict();

const paymentMethodInput = z.object({
  label: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  accountName: z.string().trim().min(2).max(160),
  accountNumber: z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z -]{3,39}$/, 'Account number may contain letters, digits, spaces and dashes'),
  currency: z.string().regex(/^[A-Z]{3}$/),
  qrImage: z.string().max(170_000).nullable().optional(),
  instructions: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).max(1000).default(0),
  internalReason: reason,
}).strict();
const paymentMethodUpdateInput = paymentMethodInput.partial().extend({ internalReason: reason }).strict();
/** What the school's own admin panel sends: the portal's fields, plus who sent it. */
const schoolPaymentSubmissionInput = paymentSubmissionInput.extend({ submittedBy: z.string().trim().min(1).max(200).optional() }).strict();

/** What a payer is shown. Everything here is meant to be handed out; nothing operator-only. */
const CUSTOMER_PAYMENT_METHOD_SELECT = {
  id: true, label: true, bankName: true, accountName: true, accountNumber: true, currency: true, qrImage: true, instructions: true,
} as const;

const LINE_SELECT = {
  id: true, position: true, kind: true, description: true, quantity: true,
  unitAmountMinor: true, amountMinor: true, taxMinor: true, periodStart: true, periodEnd: true,
} as const;

const INVOICE_SELECT = {
  id: true, invoiceNumber: true, customerSchoolId: true, status: true, currency: true, amountMinor: true, paidMinor: true,
  description: true, periodStart: true, periodEnd: true, dueAt: true, issuedAt: true, paidAt: true,
  voidedAt: true, voidReason: true, createdAt: true,
  lines: { select: LINE_SELECT, orderBy: { position: 'asc' as const } },
  payments: {
    select: { id: true, provider: true, providerReference: true, amountMinor: true, receivedAt: true, note: true, createdAt: true },
    orderBy: { receivedAt: 'desc' as const },
  },
  paymentSubmissions: { select: {
    id: true, provider: true, providerReference: true, amountMinor: true, note: true, status: true, reviewedAt: true, rejectionReason: true, createdAt: true,
    // The reviewer needs to know which statement to check, and to see the customer's receipt.
    paymentMethod: { select: { label: true, bankName: true, accountNumber: true, currency: true } }, receiptImage: true, source: true, submittedBy: true,
  }, orderBy: { createdAt: 'desc' as const } },
} as const;

export class SchoolBillingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly email: TransactionalEmailService = new DisabledTransactionalEmailService(),
    private readonly config?: MarketplaceConfig,
  ) {}

  plans() {
    return this.prisma.schoolBillingPlan.findMany({ orderBy: [{ active: 'desc' }, { amountMinor: 'asc' }] });
  }

  /** Every receiving account, archived ones included, for the operator console. */
  paymentMethods() {
    return this.prisma.schoolPaymentMethod.findMany({ orderBy: [{ active: 'desc' }, { currency: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }] });
  }

  async createPaymentMethod(operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = paymentMethodInput.parse(value);
    const { internalReason, ...data } = input;
    if (data.qrImage) validateImageDataUrl(data.qrImage, MAX_QR_IMAGE_BYTES, 'QR code');
    return this.prisma.$transaction(async (tx) => {
      const method = await tx.schoolPaymentMethod.create({ data });
      await this.audit(tx, operatorId, context, 'school_payment_method_created', method.id, internalReason, describePaymentMethod(method), 'SchoolPaymentMethod');
      return method;
    });
  }

  async updatePaymentMethod(methodId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = paymentMethodUpdateInput.parse(value);
    const { internalReason, ...data } = input;
    if (Object.keys(data).length === 0) throw new HttpError(400, 'At least one payment method field must be changed');
    if (data.qrImage) validateImageDataUrl(data.qrImage, MAX_QR_IMAGE_BYTES, 'QR code');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolPaymentMethod.findUnique({ where: { id: methodId } });
      if (!existing) throw new HttpError(404, 'Payment method not found');
      const method = await tx.schoolPaymentMethod.update({ where: { id: methodId }, data });
      await this.audit(tx, operatorId, context, 'school_payment_method_updated', method.id, internalReason, { before: describePaymentMethod(existing), after: describePaymentMethod(method) }, 'SchoolPaymentMethod');
      return method;
    });
  }

  /** Active receiving accounts in the given currencies, in the operator's chosen order. */
  private activePaymentMethods(currencies: string[], take = 10) {
    return this.prisma.schoolPaymentMethod.findMany({
      where: { active: true, currency: { in: currencies } }, select: CUSTOMER_PAYMENT_METHOD_SELECT,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take,
    });
  }

  async createPlan(operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = planInput.parse(value);
    const { internalReason, ...data } = input;
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.schoolBillingPlan.create({ data });
      await this.audit(tx, operatorId, context, 'school_billing_plan_created', plan.id, internalReason, { slug: plan.slug, currency: plan.currency, amountMinor: plan.amountMinor, billingInterval: plan.billingInterval });
      return plan;
    });
  }

  async updatePlan(planId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = planUpdateInput.parse(value);
    const { internalReason, ...data } = input;
    if (Object.keys(data).length === 0) throw new HttpError(400, 'At least one plan field must be changed');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolBillingPlan.findUnique({ where: { id: planId } });
      if (!existing) throw new HttpError(404, 'Billing plan not found');
      const plan = await tx.schoolBillingPlan.update({ where: { id: planId }, data });
      await this.audit(tx, operatorId, context, 'school_billing_plan_updated', plan.id, internalReason, { before: existing, after: plan });
      return plan;
    });
  }

  async deletePlan(planId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = notifyInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.schoolBillingPlan.findUnique({
        where: { id: planId },
        include: { _count: { select: { schools: true, invoices: true, invoiceLines: true } } },
      });
      if (!plan) throw new HttpError(404, 'Billing plan not found');
      if (plan._count.schools || plan._count.invoices || plan._count.invoiceLines) {
        throw new HttpError(409, 'This billing plan is assigned or has financial history; archive it instead of deleting it');
      }
      await this.audit(tx, operatorId, context, 'school_billing_plan_deleted', plan.id, input.internalReason, {
        slug: plan.slug, name: plan.name, currency: plan.currency, amountMinor: plan.amountMinor,
      }, 'SchoolBillingPlan');
      await tx.schoolBillingPlan.delete({ where: { id: plan.id } });
      return { deleted: true, id: plan.id };
    });
  }

  async assignPlan(schoolId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = assignPlanInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.schoolBillingPlan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.active) throw new HttpError(409, 'Billing plan is not active');
      const school = await tx.customerSchool.findUnique({ where: { id: schoolId }, select: { id: true, status: true, currency: true, billingAnchorAt: true } });
      if (!school) throw new HttpError(404, 'Customer school not found');
      if (school.status === 'TERMINATED') throw new HttpError(409, 'A terminated school cannot be assigned a billing plan');
      if (school.currency && school.currency !== plan.currency) throw new HttpError(409, `School currency must be ${plan.currency}`);
      // A school already being billed keeps its anniversary: changing plan should change the price
      // from the next period, not restart the billing year. Only a school with no anchor gets one.
      const anchor = school.billingAnchorAt ?? input.billingAnchorAt ?? startOfUtcDay(new Date());
      // The range check applies only to an anchor being set now. An existing anniversary is a fact
      // about a school already being billed -- six months of history is normal, and rejecting it
      // would make a long-standing customer unable to change plan at all.
      if (!school.billingAnchorAt) assertUsableAnchor(anchor, plan.billingInterval);
      const updated = await tx.customerSchool.update({
        where: { id: schoolId },
        data: { billingPlanId: plan.id, plan: plan.slug, currency: plan.currency, billingAnchorAt: anchor },
        select: { id: true, billingPlanId: true, plan: true, currency: true, billingAnchorAt: true },
      });
      await this.audit(tx, operatorId, context, 'school_billing_plan_assigned', schoolId, input.internalReason, { planId: plan.id, planSlug: plan.slug, billingAnchorAt: anchor.toISOString() });
      return updated;
    });
  }

  async billing(schoolId: string) {
    const school = await this.prisma.customerSchool.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true, currency: true, billingPlan: true, billingAnchorAt: true, invoices: { select: INVOICE_SELECT, orderBy: { issuedAt: 'desc' } }, billingNotifications: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });
    if (!school) throw new HttpError(404, 'Customer school not found');
    const outstandingMinor = school.invoices
      .filter((invoice) => invoice.status !== 'VOID')
      .reduce((sum, invoice) => sum + invoice.amountMinor - invoice.paidMinor, 0);
    return { schoolId: school.id, schoolName: school.name, schoolCurrency: school.currency, billingPlan: school.billingPlan, billingAnchorAt: school.billingAnchorAt, outstandingMinor, invoices: school.invoices, notifications: school.billingNotifications };
  }

  /** Customer-safe billing view. Ownership is derived from the authenticated marketplace
   * account's linked installations; callers cannot choose an arbitrary school id. Delivery
   * diagnostics and operator-only notes are deliberately excluded. */
  async customerBilling(accountId: string) {
    const schools = await this.prisma.customerSchool.findMany({
      where: { installation: { is: { accountId } } },
      select: {
        id: true, name: true, status: true, currency: true, billingAnchorAt: true,
        billingPlan: { select: { id: true, slug: true, name: true, currency: true, amountMinor: true, billingInterval: true, dueDays: true } },
        invoices: {
          select: {
            id: true, invoiceNumber: true, status: true, currency: true, amountMinor: true, paidMinor: true,
            description: true, periodStart: true, periodEnd: true, dueAt: true, issuedAt: true, paidAt: true,
            lines: { select: LINE_SELECT, orderBy: { position: 'asc' } },
            payments: { select: { id: true, provider: true, amountMinor: true, receivedAt: true }, orderBy: { receivedAt: 'desc' } },
            paymentSubmissions: { select: { id: true, provider: true, providerReference: true, amountMinor: true, note: true, status: true, reviewedAt: true, rejectionReason: true, createdAt: true, paymentMethod: { select: { label: true, bankName: true, accountNumber: true } } }, orderBy: { createdAt: 'desc' } },
          },
          orderBy: { issuedAt: 'desc' },
        },
        billingNotifications: {
          select: { id: true, invoiceId: true, type: true, subject: true, message: true, createdAt: true, sentAt: true },
          orderBy: { createdAt: 'desc' }, take: 30,
        },
      },
      orderBy: { name: 'asc' },
    });
    // One query for every currency these schools are billed in; each school then sees only its own.
    const methods = await this.activePaymentMethods([...new Set(schools.map(billedCurrency).filter((currency): currency is string => !!currency))]);
    return schools.map((school) => ({
      paymentMethods: methods.filter((method) => method.currency === billedCurrency(school)),
      schoolId: school.id,
      schoolName: school.name,
      schoolStatus: school.status,
      schoolCurrency: school.currency,
      billingPlan: school.billingPlan,
      // The customer needs this to know whether "add to my invoice" is available at checkout, and
      // to be told why when it is not.
      billingAnchorAt: school.billingAnchorAt,
      outstandingMinor: school.invoices
        .filter((invoice) => invoice.status !== 'VOID')
        .reduce((sum, invoice) => sum + invoice.amountMinor - invoice.paidMinor, 0),
      invoices: school.invoices,
      notifications: school.billingNotifications,
    }));
  }

  async submitPayment(accountId: string, value: unknown) {
    const input = paymentSubmissionInput.parse(value);
    return this.createSubmission(input, { school: { installation: { is: { accountId } } } }, { accountId, source: 'PORTAL' });
  }

  /**
   * A submission sent by the school's own admin panel, signed with its installation key -- the same
   * proof of identity it uses to fetch its bill -- so no marketplace account or second sign-in is
   * needed. That matters: a school an operator provisioned with an enrollment token may never have
   * a marketplace account, and it still has to be able to say it paid.
   */
  async submitPaymentFromSchool(registrationId: string, value: unknown) {
    const { submittedBy, ...input } = schoolPaymentSubmissionInput.parse(value);
    const registration = await this.prisma.installationRegistration.findUnique({ where: { id: registrationId }, select: { id: true, accountId: true, customerSchoolId: true } });
    if (!registration?.customerSchoolId) throw new HttpError(409, 'This installation is not linked to a customer school');
    // Scoped to the school the signing key belongs to: one school cannot report a payment against
    // another school's invoice.
    return this.createSubmission(input, { customerSchoolId: registration.customerSchoolId }, {
      accountId: registration.accountId, installationRegistrationId: registration.id, source: 'SCHOOL', submittedBy: submittedBy ?? null,
    });
  }

  private async createSubmission(
    input: z.infer<typeof paymentSubmissionInput>,
    invoiceScope: Prisma.SchoolInvoiceWhereInput,
    origin: { accountId: string | null; source: 'PORTAL' | 'SCHOOL'; installationRegistrationId?: string; submittedBy?: string | null },
  ) {
    const invoice = await this.prisma.schoolInvoice.findFirst({
      where: { id: input.invoiceId, ...invoiceScope },
      select: { id: true, status: true, amountMinor: true, paidMinor: true, currency: true },
    });
    if (!invoice) throw new HttpError(404, 'School invoice not found');
    if (invoice.status === 'PAID' || invoice.status === 'VOID') throw new HttpError(409, 'This invoice cannot receive a payment submission');
    if (input.amountMinor > invoice.amountMinor - invoice.paidMinor) throw new HttpError(409, 'Submitted amount exceeds the outstanding balance');
    if (input.paymentMethodId) {
      const method = await this.prisma.schoolPaymentMethod.findUnique({ where: { id: input.paymentMethodId }, select: { active: true, currency: true } });
      // An archived account may no longer be one finance watches; another currency cannot settle this invoice.
      if (!method || !method.active) throw new HttpError(409, 'That payment account is no longer accepting payments');
      if (method.currency !== invoice.currency) throw new HttpError(409, `That account takes ${method.currency}; this invoice is in ${invoice.currency}`);
    }
    if (input.receiptImage) validateImageDataUrl(input.receiptImage, MAX_RECEIPT_IMAGE_BYTES, 'Receipt image');
    // Selected explicitly so the receipt is not echoed back: the customer already has it, and it is
    // by far the heaviest field on the row.
    try { return await this.prisma.schoolPaymentSubmission.create({ data: { ...input, ...origin }, select: { id: true, invoiceId: true, provider: true, providerReference: true, amountMinor: true, note: true, status: true, paymentMethodId: true, source: true, createdAt: true } }); }
    catch (error: any) { if (error?.code === 'P2002') throw new HttpError(409, 'This payment reference was already submitted'); throw error; }
  }

  async decidePaymentSubmission(schoolId: string, submissionId: string, operatorId: string, approve: boolean, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = paymentSubmissionDecision.parse(value);
    const submission = await this.prisma.schoolPaymentSubmission.findFirst({ where: { id: submissionId, invoice: { customerSchoolId: schoolId } } });
    if (!submission) throw new HttpError(404, 'Payment submission not found');
    if (submission.status !== 'PENDING') throw new HttpError(409, 'Payment submission was already reviewed');
    if (!approve && !input.rejectionReason) throw new HttpError(400, 'A rejection reason is required');
    if (approve) {
      await this.recordPayment(schoolId, submission.invoiceId, operatorId, {
        provider: submission.provider, providerReference: submission.providerReference, amountMinor: submission.amountMinor,
        // The stored note is null when the customer left it empty, and recordPayment accepts a string
        // or nothing -- never null -- so passing it on made confirming most payments fail validation.
        note: submission.note ?? undefined, receivedAt: now, internalReason: input.internalReason,
      }, context, now);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.schoolPaymentSubmission.update({
        where: { id: submission.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedByOperatorId: operatorId, reviewedAt: now, rejectionReason: approve ? null : input.rejectionReason },
      });
      await this.audit(tx, operatorId, context, approve ? 'school_payment_submission_approved' : 'school_payment_submission_rejected', schoolId, input.internalReason, { submissionId, invoiceId: submission.invoiceId, rejectionReason: input.rejectionReason || null });
      return updated;
    });
  }

  async installationControl(registrationId: string, now = new Date()) {
    const school = await this.prisma.customerSchool.findFirst({
      where: { installation: { id: registrationId } },
      select: {
        id: true, name: true, status: true, suspendedReason: true, currency: true,
        billingPlan: { select: { name: true, currency: true, amountMinor: true, billingInterval: true, dueDays: true } },
        billingNotifications: {
          select: { id: true, invoiceId: true, type: true, subject: true, message: true, createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 30,
        },
        invoices: { where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, select: {
          id: true, invoiceNumber: true, status: true, currency: true, amountMinor: true, paidMinor: true,
          description: true, issuedAt: true, paidAt: true, dueAt: true,
          lines: { select: LINE_SELECT, orderBy: { position: 'asc' } },
          // So the school can show "submitted, awaiting confirmation" beside the invoice it paid.
          paymentSubmissions: { select: { id: true, status: true, providerReference: true, amountMinor: true, createdAt: true, rejectionReason: true }, orderBy: { createdAt: 'desc' }, take: 5 },
          notifications: { where: { type: 'OVERDUE' }, select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        }, orderBy: { dueAt: 'asc' } },
      },
    });
    if (!school) return { managed: false, access: 'ACTIVE', checkedAt: now.toISOString(), warnings: [] };
    // The school shows these beside its bill. Capped, because each carries a QR image and the whole
    // summary is re-synced into the school's own database every hour.
    const currency = billedCurrency(school);
    const paymentMethods = await this.activePaymentMethods(currency ? [currency] : [], 5);
    const graceMs = 3 * 24 * 60 * 60 * 1000;
    // The grace clock begins only when the durable final OVERDUE notice is created. A delayed
    // alert job therefore cannot shorten the customer's promised three-day warning window.
    const overdue = school.invoices.filter((invoice) => invoice.dueAt.getTime() < now.getTime() && invoice.notifications[0]);
    const blocking = overdue.filter((invoice) => invoice.notifications[0].createdAt.getTime() + graceMs <= now.getTime());
    const lifecycleBlocked = school.status === 'SUSPENDED' || school.status === 'TERMINATED';
    return {
      managed: true,
      schoolId: school.id,
      schoolName: school.name,
      access: lifecycleBlocked || blocking.length ? 'SUSPENDED' : 'ACTIVE',
      reason: lifecycleBlocked ? (school.suspendedReason || `School is ${school.status.toLowerCase()}`) : blocking.length ? 'Platform invoice remains unpaid three days after the final notice' : null,
      checkedAt: now.toISOString(),
      warnings: overdue.map((invoice) => ({
        invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency,
        outstandingMinor: invoice.amountMinor - invoice.paidMinor, dueAt: invoice.dueAt.toISOString(),
        suspendAt: new Date(invoice.notifications[0].createdAt.getTime() + graceMs).toISOString(), final: true,
      })),
      billing: {
        schoolName: school.name,
        currency: school.currency,
        paymentMethods,
        billingPlan: school.billingPlan,
        outstandingMinor: school.invoices.reduce((sum, invoice) => sum + invoice.amountMinor - invoice.paidMinor, 0),
        invoices: school.invoices.map(({ notifications: _notifications, ...invoice }) => invoice),
        notifications: school.billingNotifications,
      },
    };
  }

  async signedInstallationControl(registrationId: string, now = new Date()) {
    if (!this.config) throw new HttpError(503, 'School control signing is not configured');
    const [control, registration] = await Promise.all([
      this.installationControl(registrationId, now),
      this.prisma.installationRegistration.update({
        where: { id: registrationId }, data: { controlGeneration: { increment: 1 } },
        select: { installationId: true, controlGeneration: true },
      }),
    ]);
    const payload = {
      schemaVersion: 1, generation: registration.controlGeneration,
      installationId: registration.installationId, issuedAt: now.toISOString(),
      audience: 'wattanam-school-control', keyId: this.config.entitlementKeyId,
      ...control,
    };
    return { payload, signature: {
      algorithm: 'ed25519' as const, keyId: this.config.entitlementKeyId,
      value: sign(null, Buffer.from(canonicalJson(payload)), this.config.entitlementPrivateKey).toString('base64'),
    } };
  }

  async issuePlanInvoice(schoolId: string, operatorId: string | null, value: unknown, context: PlatformActionContext, origin: 'OPERATOR' | 'SCHEDULED' = 'OPERATOR') {
    const input = planInvoiceInput.parse(value);
    const school = await this.prisma.customerSchool.findUnique({ where: { id: schoolId }, include: { billingPlan: true } });
    if (!school?.billingPlan || !school.billingPlan.active) throw new HttpError(409, 'Assign an active central billing plan first');
    const plan = school.billingPlan;
    const start = input.periodStart;
    const end = periodEndFor(start, plan.billingInterval);
    // Derived from the period, not from today. Computing it from now() meant back-issuing an old
    // invoice handed it a full fresh grace period, so a January invoice raised in March was not
    // late at all.
    const dueAt = new Date(start.getTime() + plan.dueDays * 86_400_000);
    const description = `${plan.name} (${plan.billingInterval.toLowerCase()})`;
    // Everything bought on account since the last invoice rides along on this one. Collected here
    // rather than at purchase time so a school receives one bill, not a bill per plugin.
    const pluginLines = await this.unbilledPluginLines(schoolId, plan.currency);
    return this.issueInvoice(schoolId, operatorId, {
      currency: plan.currency, description,
      periodStart: start, periodEnd: end, dueAt,
      lines: [
        { kind: 'SUBSCRIPTION', description, quantity: 1, unitAmountMinor: plan.amountMinor, periodStart: start, periodEnd: end },
        ...pluginLines.map((line) => ({ kind: 'PLUGIN' as const, description: line.description, quantity: 1, unitAmountMinor: line.unitPriceMinor, sourceOrderLineId: line.id })),
      ],
      idempotencyKey: input.idempotencyKey, internalReason: input.internalReason,
    }, context, new Date(), plan, periodKeyFor(plan.id, start), origin);
  }

  /**
   * Plugin purchases this school made on account and has not been billed for yet.
   *
   * "Not billed yet" is the absence of a SchoolInvoiceLine pointing at the order line, and that
   * column is unique -- so a plugin cannot land on two invoices even if two billing runs race.
   * A currency that does not match the school's is left behind rather than converted; it will keep
   * being skipped, visibly, until somebody prices it properly or refunds it.
   */
  private async unbilledPluginLines(schoolId: string, currency: string) {
    const lines = await this.prisma.marketplaceOrderLine.findMany({
      where: {
        invoiceLine: { is: null },
        order: { is: { settlementMode: 'INVOICE', status: { not: 'CANCELLED' }, currency, installation: { is: { customerSchoolId: schoolId } } } },
      },
      select: { id: true, unitPriceMinor: true, plugin: { select: { name: true } } },
      orderBy: { id: 'asc' },
      take: 50,
    });
    return lines.map((line) => ({ id: line.id, unitPriceMinor: line.unitPriceMinor, description: `${line.plugin.name} (plugin licence)` }));
  }

  /**
   * The recurring subscription run.
   *
   * Until this existed a monthly plan meant a person clicking once per school per month, forever,
   * and remembering which schools they had already done. It is deliberately shaped like
   * `dispatchDueAlerts`: safe to call repeatedly, safe across restarts, and safe with two replicas
   * running it at once -- the period unique index is what makes the last of those true, so a race
   * ends in one invoice and a skip rather than two invoices.
   *
   * Only ACTIVE schools accrue. A suspended school has already lost access to the panel where it
   * would see a bill, and silently growing a debt it cannot look at is not billing, it is a trap.
   */
  async runBillingCycle(now = new Date()) {
    const schools = await this.prisma.customerSchool.findMany({
      where: { status: 'ACTIVE', billingAnchorAt: { not: null }, billingPlan: { is: { active: true } } },
      select: { id: true, name: true, billingAnchorAt: true, billingPlan: { select: { id: true, billingInterval: true } } },
      take: 500,
    });
    const result = { inspected: schools.length, issued: 0, alreadyBilled: 0, failed: 0 };
    for (const school of schools) {
      const plan = school.billingPlan!;
      for (const periodStart of duePeriods(school.billingAnchorAt!, plan.billingInterval, now)) {
        const periodKey = periodKeyFor(plan.id, periodStart);
        const existing = await this.prisma.schoolInvoice.findFirst({ where: { customerSchoolId: school.id, periodKey }, select: { id: true } });
        if (existing) { result.alreadyBilled += 1; continue; }
        try {
          await this.issuePlanInvoice(school.id, null, {
            periodStart, idempotencyKey: `scheduled:${periodKey}:${school.id}`,
            internalReason: `Scheduled ${plan.billingInterval.toLowerCase()} billing run for the period beginning ${periodStart.toISOString().slice(0, 10)}.`,
          }, { correlationId: `billing-cycle-${now.toISOString()}` }, 'SCHEDULED');
          result.issued += 1;
        } catch (error) {
          // One school's failure must not stop the run for every other school.
          result.failed += 1;
          this.log('school billing cycle invoice failed', { schoolId: school.id, periodKey, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return result;
  }

  async issueInvoice(
    schoolId: string, operatorId: string | null, value: unknown, context: PlatformActionContext,
    now = new Date(), plan?: { id: string; slug: string }, periodKey?: string,
    origin: 'OPERATOR' | 'SCHEDULED' = 'OPERATOR',
  ) {
    const input = invoiceInput.parse(value);
    const { internalReason, lines: inputLines, amountMinor: statedTotal, ...fields } = input;
    // An invoice with no explicit lines still gets one, so every invoice from here on has a
    // breakdown and the read paths never have to handle a line-less special case.
    const lines = inputLines?.length
      ? inputLines
      : [{ kind: 'ADJUSTMENT' as const, description: input.description, quantity: 1, unitAmountMinor: statedTotal!, periodStart: input.periodStart, periodEnd: input.periodEnd }];
    const amountMinor = lines.reduce((sum, line) => safeMinorTotal(sum, line.quantity * line.unitAmountMinor), 0);
    if (statedTotal !== undefined && statedTotal !== amountMinor) {
      throw new HttpError(409, `Invoice total ${statedTotal} does not match the sum of its lines (${amountMinor})`);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolInvoice.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: INVOICE_SELECT });
      if (existing) {
        if (existing.customerSchoolId !== schoolId || existing.currency !== input.currency || existing.amountMinor !== amountMinor || existing.description !== input.description) {
          throw new HttpError(409, 'Idempotency key is already used for a different invoice');
        }
        return existing;
      }
      const school = await tx.customerSchool.findUnique({ where: { id: schoolId }, select: { id: true, status: true, currency: true, contactEmail: true, name: true } });
      if (!school) throw new HttpError(404, 'Customer school not found');
      if (school.status === 'TERMINATED') throw new HttpError(409, 'A terminated school cannot receive a new invoice');
      if (school.currency && school.currency !== input.currency) throw new HttpError(409, `Invoice currency must be ${school.currency}`);
      const invoice = await tx.schoolInvoice.create({
        data: {
          ...fields, amountMinor, customerSchoolId: schoolId, createdByOperatorId: operatorId,
          invoiceNumber: `WTN-${now.getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`,
          issuedAt: now, billingPlanId: plan?.id, billingPlanSlug: plan?.slug, periodKey, origin,
          lines: { create: lines.map((line, position) => ({
            position, kind: line.kind, description: line.description, quantity: line.quantity,
            unitAmountMinor: line.unitAmountMinor, amountMinor: line.quantity * line.unitAmountMinor,
            periodStart: line.periodStart, periodEnd: line.periodEnd, billingPlanId: line.kind === 'SUBSCRIPTION' ? plan?.id : undefined,
            sourceOrderLineId: line.sourceOrderLineId,
          })) },
        },
        select: INVOICE_SELECT,
      });
      await this.audit(tx, operatorId, context, 'school_invoice_issued', schoolId, internalReason, {
        invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency, amountMinor: invoice.amountMinor,
      });
      await tx.schoolBillingNotification.create({ data: {
        customerSchoolId: schoolId, invoiceId: invoice.id, type: 'INVOICE_ISSUED', recipientEmail: school.contactEmail,
        subject: `Wattanam invoice ${invoice.invoiceNumber}`,
        message: `${school.name}: invoice ${invoice.invoiceNumber} for ${(invoice.amountMinor / 100).toFixed(2)} ${invoice.currency} is due ${invoice.dueAt.toISOString().slice(0, 10)}.`,
        deduplicationKey: `invoice-issued:${invoice.id}`,
      } });
      return invoice;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      // The database refuses a second live invoice for one plan period. Reaching here means two
      // operators (or two clicks) raced; saying so is more use than a unique-constraint dump.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && periodKey) {
        throw new HttpError(409, 'This school has already been invoiced for that billing period');
      }
      throw error;
    });
    await this.deliverPending(result.id, now);
    return result;
  }

  /** Called by a Railway cron or an authorized operator. It is safe to retry: notification keys
   * make each invoice/type alert unique, while failed delivery remains visible and retryable. */
  async dispatchDueAlerts(now = new Date()) {
    const dueSoon = new Date(now); dueSoon.setUTCDate(dueSoon.getUTCDate() + 7);
    const invoices = await this.prisma.schoolInvoice.findMany({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueAt: { lte: dueSoon } },
      include: { school: { select: { id: true, name: true, contactEmail: true } } }, take: 500,
    });
    for (const invoice of invoices) {
      const type = invoice.dueAt < now ? 'OVERDUE' : 'DUE_SOON';
      await this.prisma.schoolBillingNotification.upsert({
        where: { deduplicationKey: `${type.toLowerCase()}:${invoice.id}` }, update: {},
        create: {
          customerSchoolId: invoice.school.id, invoiceId: invoice.id, type,
          recipientEmail: invoice.school.contactEmail,
          subject: type === 'OVERDUE' ? `Overdue Wattanam invoice ${invoice.invoiceNumber}` : `Wattanam invoice due soon: ${invoice.invoiceNumber}`,
          message: `${invoice.school.name}: ${(invoice.amountMinor - invoice.paidMinor) / 100} ${invoice.currency} remains due on ${invoice.dueAt.toISOString().slice(0, 10)}.`,
          deduplicationKey: `${type.toLowerCase()}:${invoice.id}`,
        },
      });
      await this.deliverPending(invoice.id, now);
    }
    return { inspected: invoices.length };
  }

  async resendInvoiceNotification(schoolId: string, invoiceId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = notifyInput.parse(value);
    const notification = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.schoolInvoice.findFirst({
        where: { id: invoiceId, customerSchoolId: schoolId },
        include: { school: { select: { name: true, contactEmail: true } } },
      });
      if (!invoice) throw new HttpError(404, 'School invoice not found');
      if (invoice.status === 'VOID') throw new HttpError(409, 'A void invoice cannot be notified');
      const subject = `Wattanam invoice ${invoice.invoiceNumber}`;
      const message = `${invoice.school.name}: invoice ${invoice.invoiceNumber} for ${(invoice.amountMinor / 100).toFixed(2)} ${invoice.currency} is due ${invoice.dueAt.toISOString().slice(0, 10)}.`;
      const row = await tx.schoolBillingNotification.upsert({
        where: { deduplicationKey: `invoice-issued:${invoice.id}` },
        update: { status: 'PENDING', recipientEmail: invoice.school.contactEmail, subject, message, attemptedAt: null, sentAt: null, failureMessage: null },
        create: {
          customerSchoolId: schoolId, invoiceId: invoice.id, type: 'INVOICE_ISSUED', recipientEmail: invoice.school.contactEmail,
          subject, message, deduplicationKey: `invoice-issued:${invoice.id}`,
        },
      });
      await this.audit(tx, operatorId, context, 'school_invoice_notification_sent', schoolId, input.internalReason, {
        invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, notificationId: row.id,
      });
      return row;
    });
    await this.deliverPending(invoiceId, now);
    return this.prisma.schoolBillingNotification.findUnique({ where: { id: notification.id } });
  }

  private async deliverPending(invoiceId: string, now: Date) {
    const rows = await this.prisma.schoolBillingNotification.findMany({ where: { invoiceId, status: { in: ['PENDING', 'FAILED'] } }, orderBy: { createdAt: 'asc' } });
    for (const row of rows) {
      // The durable notification is the primary delivery channel: customer schools receive it in
      // the installation-signed school-control payload and store/show it in their own dashboard.
      // Email is only an optional secondary channel. A marketplace intentionally configured for
      // MFA-only operation must therefore not label a successfully published in-app alert as a
      // failure merely because no third-party mail provider is configured.
      if (this.config?.transactionalEmail.provider === 'disabled') {
        await this.prisma.schoolBillingNotification.update({
          where: { id: row.id },
          data: { status: 'SENT', attemptedAt: now, sentAt: now, failureMessage: null },
        });
        continue;
      }
      if (!row.recipientEmail) {
        await this.prisma.schoolBillingNotification.update({ where: { id: row.id }, data: { status: 'SKIPPED', attemptedAt: now, failureMessage: 'School contact email is not configured' } });
        continue;
      }
      try {
        await this.email.send({ to: row.recipientEmail, subject: row.subject, text: row.message, html: `<p>${escapeHtml(row.message)}</p>` });
        await this.prisma.schoolBillingNotification.update({ where: { id: row.id }, data: { status: 'SENT', attemptedAt: now, sentAt: now, failureMessage: null } });
      } catch (error) {
        await this.prisma.schoolBillingNotification.update({ where: { id: row.id }, data: { status: 'FAILED', attemptedAt: now, failureMessage: error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed' } });
      }
    }
  }

  async recordPayment(schoolId: string, invoiceId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = paymentInput.parse(value);
    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school-invoice'), hashtext(${invoiceId}))`;
      const duplicate = await tx.schoolPayment.findUnique({
        where: { provider_providerReference: { provider: input.provider, providerReference: input.providerReference } },
      });
      if (duplicate) {
        if (duplicate.invoiceId !== invoiceId || duplicate.amountMinor !== input.amountMinor) throw new HttpError(409, 'Payment reference is already used for a different payment');
        return duplicate;
      }
      const invoice = await tx.schoolInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.customerSchoolId !== schoolId) throw new HttpError(404, 'School invoice not found');
      if (invoice.status === 'VOID') throw new HttpError(409, 'A void invoice cannot receive payment');
      if (invoice.status === 'PAID') throw new HttpError(409, 'Invoice is already paid');
      const nextPaid = invoice.paidMinor + input.amountMinor;
      if (!Number.isSafeInteger(nextPaid) || nextPaid > invoice.amountMinor) throw new HttpError(409, 'Payment exceeds the invoice balance');
      const receivedAt = input.receivedAt ?? now;
      const payment = await tx.schoolPayment.create({
        data: {
          invoiceId, provider: input.provider, providerReference: input.providerReference,
          amountMinor: input.amountMinor, receivedAt, note: input.note, recordedByOperatorId: operatorId,
        },
      });
      const paid = nextPaid === invoice.amountMinor;
      await tx.schoolInvoice.update({
        where: { id: invoiceId },
        data: { paidMinor: nextPaid, status: paid ? 'PAID' : 'PARTIALLY_PAID', paidAt: paid ? receivedAt : null },
      });
      // A plugin bought on account leaves its order PENDING until the invoice carrying it is
      // settled. Closing that loop here keeps the orders list honest: without it an order bought on
      // credit and long since paid would sit as PENDING forever.
      if (paid) {
        const billedOrderLines = await tx.schoolInvoiceLine.findMany({ where: { invoiceId, kind: 'PLUGIN', sourceOrderLineId: { not: null } }, select: { sourceOrderLineId: true } });
        const orderLineIds = billedOrderLines.map((line) => line.sourceOrderLineId!).filter(Boolean);
        if (orderLineIds.length) {
          const closing = await tx.marketplaceOrder.findMany({
            where: { settlementMode: 'INVOICE', status: 'PENDING', lines: { some: { id: { in: orderLineIds } } } },
            select: { id: true, currency: true, lines: { select: { id: true, unitPriceMinor: true, plugin: { select: { publisherId: true } } } } },
          });
          await tx.marketplaceOrder.updateMany({ where: { id: { in: closing.map((order) => order.id) } }, data: { status: 'PAID' } });
          // A plugin bought on account is licensed before the money arrives, but the publisher's
          // share is only earned once it does -- which is here.
          for (const order of closing) await recordSaleEntries(tx, order);
        }
      }
      await this.audit(tx, operatorId, context, 'school_payment_recorded', schoolId, input.internalReason, {
        invoiceId, paymentId: payment.id, provider: payment.provider, providerReference: payment.providerReference,
        amountMinor: payment.amountMinor, resultingPaidMinor: nextPaid,
      });
      const school = await tx.customerSchool.findUnique({ where: { id: schoolId }, select: { name: true, contactEmail: true } });
      if (school) await tx.schoolBillingNotification.create({ data: {
        customerSchoolId: schoolId, invoiceId, type: 'PAYMENT_RECEIVED', recipientEmail: school.contactEmail,
        subject: `Payment received for ${invoice.invoiceNumber}`,
        message: `${school.name}: ${(payment.amountMinor / 100).toFixed(2)} ${invoice.currency} was received for invoice ${invoice.invoiceNumber}. ${paid ? 'The invoice is paid in full.' : `${(invoice.amountMinor - nextPaid) / 100} ${invoice.currency} remains due.`}`,
        deduplicationKey: `payment-received:${payment.id}`,
      } });
      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.deliverPending(invoiceId, now);
    return payment;
  }

  async voidInvoice(schoolId: string, invoiceId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = voidInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school-invoice'), hashtext(${invoiceId}))`;
      const invoice = await tx.schoolInvoice.findUnique({ where: { id: invoiceId }, include: { lines: { where: { kind: 'PLUGIN' }, select: { id: true, description: true, sourceOrderLineId: true } } } });
      if (!invoice || invoice.customerSchoolId !== schoolId) throw new HttpError(404, 'School invoice not found');
      if (invoice.status === 'VOID') return { id: invoice.id, status: invoice.status };
      if (invoice.paidMinor !== 0) throw new HttpError(409, 'An invoice with payments cannot be voided');
      // The other half of buying on credit: a plugin granted against this invoice loses its licence
      // when the invoice is cancelled. Suspension deliberately does not do this -- downloads and
      // updates are already blocked while a school is suspended, and a school that settles its bill
      // should find its plugins where it left them.
      const revokedEntitlements: string[] = [];
      for (const line of invoice.lines) {
        if (!line.sourceOrderLineId) continue;
        const entitlement = await tx.installationEntitlement.findFirst({ where: { orderLineId: line.sourceOrderLineId, status: 'ACTIVE' }, select: { id: true, signedToken: true } });
        if (!entitlement) continue;
        const terminal = this.config
          ? issueTerminalEntitlement(entitlement.signedToken, 'REVOKED', this.config.entitlementPrivateKey, this.config.entitlementKeyId, now)
          : null;
        await tx.installationEntitlement.update({
          where: { id: entitlement.id },
          data: {
            status: 'REVOKED', revokedAt: now, revokedReason: `Invoice ${invoice.invoiceNumber} was voided`,
            ...(terminal ? {
              generation: terminal.payload.generation, tokenId: terminal.payload.tokenId,
              signedToken: terminal as unknown as Prisma.InputJsonValue,
            } : {}),
          },
        });
        revokedEntitlements.push(entitlement.id);
      }
      const updated = await tx.schoolInvoice.update({
        // Clearing periodKey releases the period guard, so a voided month can be invoiced again.
        where: { id: invoiceId }, data: { status: 'VOID', voidedAt: now, voidReason: input.internalReason, periodKey: null },
        select: { id: true, status: true, voidedAt: true },
      });
      await this.audit(tx, operatorId, context, 'school_invoice_voided', schoolId, input.internalReason, { invoiceId, revokedEntitlements });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private log(message: string, detail: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: 'warn', message, ...detail }));
  }

  private audit(tx: Prisma.TransactionClient, operatorId: string | null, context: PlatformActionContext, action: string, schoolId: string, reasonValue: string, metadata: Prisma.InputJsonValue, targetType = 'CustomerSchool') {
    return tx.platformAuditEvent.create({ data: {
      operatorId, action, success: true, targetType, targetId: schoolId,
      reason: reasonValue, metadata, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
    } });
  }
}

/** One plan period, as the database sees it. Null for one-off invoices and cleared on void. */
function periodKeyFor(planId: string, periodStart: Date) {
  return `${planId}:${periodStart.toISOString()}`;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * An anchor far in the past would have the billing run raise every period since, which for a
 * mistyped year is dozens of invoices to a real customer. Refusing it at the point somebody types
 * it is far better than defending against it in the run, where the damage is already a decision
 * the run has to un-make.
 */
function assertUsableAnchor(anchor: Date, interval: 'MONTHLY' | 'ANNUAL', now = new Date()) {
  const earliest = new Date(now);
  const latest = new Date(now);
  if (interval === 'MONTHLY') { earliest.setUTCMonth(earliest.getUTCMonth() - 1); latest.setUTCMonth(latest.getUTCMonth() + 1); }
  else { earliest.setUTCFullYear(earliest.getUTCFullYear() - 1); latest.setUTCFullYear(latest.getUTCFullYear() + 1); }
  if (anchor < earliest) throw new HttpError(409, `Billing anchor is more than one ${interval.toLowerCase()} period in the past`);
  if (anchor > latest) throw new HttpError(409, `Billing anchor is more than one ${interval.toLowerCase()} period in the future`);
}

/**
 * Every period that has started on or before `now`, counted forward from the anchor.
 *
 * Counted from the anchor rather than by repeatedly adding an interval to the previous result, so
 * a 31st-of-the-month anchor does not walk backwards: adding a month to 31 January gives 3 March
 * in JavaScript, and doing that repeatedly drifts the anniversary a few days every year. Deriving
 * period n directly from the anchor keeps it pinned, and a month with too few days clamps to its
 * last day for that period only.
 */
function duePeriods(anchor: Date, interval: 'MONTHLY' | 'ANNUAL', now: Date, limit = 12): Date[] {
  const periods: Date[] = [];
  for (let index = 0; periods.length < limit; index += 1) {
    const start = addPeriods(anchor, interval, index);
    if (start.getTime() > now.getTime()) break;
    periods.push(start);
  }
  return periods;
}

function addPeriods(anchor: Date, interval: 'MONTHLY' | 'ANNUAL', count: number) {
  const day = anchor.getUTCDate();
  const monthsForward = interval === 'MONTHLY' ? count : count * 12;
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + monthsForward;
  // Day 0 of the following month is the last day of this one, which is how a 31st anchor lands on
  // the 28th or 30th in a short month without spilling into the next.
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, daysInTargetMonth), anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
}

function periodEndFor(start: Date, interval: 'MONTHLY' | 'ANNUAL') {
  const end = new Date(start);
  if (interval === 'MONTHLY') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

/** Mirrors commerce.service.ts: a total that leaves safe-integer range is a bug, not a big number. */
function safeMinorTotal(sum: number, amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpError(409, 'Invalid invoice line amount');
  const result = sum + amount;
  if (!Number.isSafeInteger(result) || result > 2_000_000_000) throw new HttpError(409, 'Invoice total exceeds the supported range');
  return result;
}

/** The currency a school is billed in: its own, or failing that its plan's. */
function billedCurrency(school: { currency: string | null; billingPlan?: { currency: string } | null }) {
  return school.currency || school.billingPlan?.currency || null;
}

/**
 * The audit view of a receiving account. The QR image is too large for an audit row, so it is
 * recorded by hash -- enough to show that the code customers scan was replaced, which is the change
 * most worth seeing, since it redirects where money goes.
 */
function describePaymentMethod(method: { label: string; bankName: string; accountName: string; accountNumber: string; currency: string; qrImage: string | null; instructions: string | null; active: boolean; position: number }) {
  return {
    label: method.label, bankName: method.bankName, accountName: method.accountName, accountNumber: method.accountNumber,
    currency: method.currency, active: method.active, position: method.position, hasInstructions: !!method.instructions,
    qrImageSha256: method.qrImage ? createHash('sha256').update(method.qrImage).digest('hex').slice(0, 16) : null,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
