import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';
import { DisabledTransactionalEmailService, TransactionalEmailService } from './transactional-email.service';

const reason = z.string().trim().min(3).max(5000);
const invoiceInput = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  amountMinor: z.number().int().positive().max(2_000_000_000),
  description: z.string().trim().min(3).max(2000),
  dueAt: z.coerce.date(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  idempotencyKey: z.string().min(16).max(200),
  internalReason: reason,
}).strict().refine((value) => !value.periodStart || !value.periodEnd || value.periodEnd > value.periodStart, {
  message: 'periodEnd must be after periodStart', path: ['periodEnd'],
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
const planInput = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), name: z.string().trim().min(2).max(120),
  currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().positive().max(2_000_000_000),
  billingInterval: z.enum(['MONTHLY', 'ANNUAL']), dueDays: z.number().int().min(1).max(90).default(14),
  active: z.boolean().default(true), internalReason: reason,
}).strict();
const assignPlanInput = z.object({ planId: z.string().uuid(), internalReason: reason }).strict();
const planInvoiceInput = z.object({ periodStart: z.coerce.date(), idempotencyKey: z.string().min(16).max(200), internalReason: reason }).strict();

const INVOICE_SELECT = {
  id: true, invoiceNumber: true, customerSchoolId: true, status: true, currency: true, amountMinor: true, paidMinor: true,
  description: true, periodStart: true, periodEnd: true, dueAt: true, issuedAt: true, paidAt: true,
  voidedAt: true, voidReason: true, createdAt: true,
  payments: {
    select: { id: true, provider: true, providerReference: true, amountMinor: true, receivedAt: true, note: true, createdAt: true },
    orderBy: { receivedAt: 'desc' as const },
  },
} as const;

export class SchoolBillingService {
  constructor(private readonly prisma: PrismaClient, private readonly email: TransactionalEmailService = new DisabledTransactionalEmailService()) {}

  plans() {
    return this.prisma.schoolBillingPlan.findMany({ orderBy: [{ active: 'desc' }, { amountMinor: 'asc' }] });
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

  async assignPlan(schoolId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = assignPlanInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.schoolBillingPlan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.active) throw new HttpError(409, 'Billing plan is not active');
      const school = await tx.customerSchool.findUnique({ where: { id: schoolId }, select: { id: true, status: true, currency: true } });
      if (!school) throw new HttpError(404, 'Customer school not found');
      if (school.status === 'TERMINATED') throw new HttpError(409, 'A terminated school cannot be assigned a billing plan');
      if (school.currency && school.currency !== plan.currency) throw new HttpError(409, `School currency must be ${plan.currency}`);
      const updated = await tx.customerSchool.update({ where: { id: schoolId }, data: { billingPlanId: plan.id, plan: plan.slug, currency: plan.currency }, select: { id: true, billingPlanId: true, plan: true, currency: true } });
      await this.audit(tx, operatorId, context, 'school_billing_plan_assigned', schoolId, input.internalReason, { planId: plan.id, planSlug: plan.slug });
      return updated;
    });
  }

  async billing(schoolId: string) {
    const school = await this.prisma.customerSchool.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true, currency: true, billingPlan: true, invoices: { select: INVOICE_SELECT, orderBy: { issuedAt: 'desc' } }, billingNotifications: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });
    if (!school) throw new HttpError(404, 'Customer school not found');
    const outstandingMinor = school.invoices
      .filter((invoice) => invoice.status !== 'VOID')
      .reduce((sum, invoice) => sum + invoice.amountMinor - invoice.paidMinor, 0);
    return { schoolId: school.id, schoolName: school.name, schoolCurrency: school.currency, billingPlan: school.billingPlan, outstandingMinor, invoices: school.invoices, notifications: school.billingNotifications };
  }

  /** Customer-safe billing view. Ownership is derived from the authenticated marketplace
   * account's linked installations; callers cannot choose an arbitrary school id. Delivery
   * diagnostics and operator-only notes are deliberately excluded. */
  async customerBilling(accountId: string) {
    const schools = await this.prisma.customerSchool.findMany({
      where: { installation: { is: { accountId } } },
      select: {
        id: true, name: true, status: true, currency: true,
        billingPlan: { select: { id: true, slug: true, name: true, currency: true, amountMinor: true, billingInterval: true, dueDays: true } },
        invoices: {
          select: {
            id: true, invoiceNumber: true, status: true, currency: true, amountMinor: true, paidMinor: true,
            description: true, periodStart: true, periodEnd: true, dueAt: true, issuedAt: true, paidAt: true,
            payments: { select: { id: true, provider: true, amountMinor: true, receivedAt: true }, orderBy: { receivedAt: 'desc' } },
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
    return schools.map((school) => ({
      schoolId: school.id,
      schoolName: school.name,
      schoolStatus: school.status,
      schoolCurrency: school.currency,
      billingPlan: school.billingPlan,
      outstandingMinor: school.invoices
        .filter((invoice) => invoice.status !== 'VOID')
        .reduce((sum, invoice) => sum + invoice.amountMinor - invoice.paidMinor, 0),
      invoices: school.invoices,
      notifications: school.billingNotifications,
    }));
  }

  async installationControl(registrationId: string, now = new Date()) {
    const school = await this.prisma.customerSchool.findFirst({
      where: { installation: { id: registrationId } },
      select: {
        id: true, name: true, status: true, suspendedReason: true,
        invoices: { where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, select: {
          id: true, invoiceNumber: true, currency: true, amountMinor: true, paidMinor: true, dueAt: true,
          notifications: { where: { type: 'OVERDUE' }, select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        }, orderBy: { dueAt: 'asc' } },
      },
    });
    if (!school) return { managed: false, access: 'ACTIVE', checkedAt: now.toISOString(), warnings: [] };
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
    };
  }

  async issuePlanInvoice(schoolId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = planInvoiceInput.parse(value);
    const school = await this.prisma.customerSchool.findUnique({ where: { id: schoolId }, include: { billingPlan: true } });
    if (!school?.billingPlan || !school.billingPlan.active) throw new HttpError(409, 'Assign an active central billing plan first');
    const start = input.periodStart;
    const end = new Date(start);
    if (school.billingPlan.billingInterval === 'MONTHLY') end.setUTCMonth(end.getUTCMonth() + 1);
    else end.setUTCFullYear(end.getUTCFullYear() + 1);
    const dueAt = new Date(); dueAt.setUTCDate(dueAt.getUTCDate() + school.billingPlan.dueDays);
    return this.issueInvoice(schoolId, operatorId, {
      currency: school.billingPlan.currency, amountMinor: school.billingPlan.amountMinor,
      description: `${school.billingPlan.name} (${school.billingPlan.billingInterval.toLowerCase()})`,
      periodStart: start, periodEnd: end, dueAt, idempotencyKey: input.idempotencyKey, internalReason: input.internalReason,
    }, context, new Date(), school.billingPlan);
  }

  async issueInvoice(schoolId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date(), plan?: { id: string; slug: string }) {
    const input = invoiceInput.parse(value);
    const { internalReason, ...fields } = input;
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolInvoice.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: INVOICE_SELECT });
      if (existing) {
        if (existing.customerSchoolId !== schoolId || existing.currency !== input.currency || existing.amountMinor !== input.amountMinor || existing.description !== input.description) {
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
          ...fields, customerSchoolId: schoolId, createdByOperatorId: operatorId,
          invoiceNumber: `WTN-${now.getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`,
          issuedAt: now, billingPlanId: plan?.id, billingPlanSlug: plan?.slug,
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

  private async deliverPending(invoiceId: string, now: Date) {
    const rows = await this.prisma.schoolBillingNotification.findMany({ where: { invoiceId, status: { in: ['PENDING', 'FAILED'] } }, orderBy: { createdAt: 'asc' } });
    for (const row of rows) {
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
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('school-invoice'), hashtext(${invoiceId}))`;
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
      await this.audit(tx, operatorId, context, 'school_payment_recorded', schoolId, input.internalReason, {
        invoiceId, paymentId: payment.id, provider: payment.provider, providerReference: payment.providerReference,
        amountMinor: payment.amountMinor, resultingPaidMinor: nextPaid,
      });
      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async voidInvoice(schoolId: string, invoiceId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = voidInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('school-invoice'), hashtext(${invoiceId}))`;
      const invoice = await tx.schoolInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.customerSchoolId !== schoolId) throw new HttpError(404, 'School invoice not found');
      if (invoice.status === 'VOID') return { id: invoice.id, status: invoice.status };
      if (invoice.paidMinor !== 0) throw new HttpError(409, 'An invoice with payments cannot be voided');
      const updated = await tx.schoolInvoice.update({
        where: { id: invoiceId }, data: { status: 'VOID', voidedAt: now, voidReason: input.internalReason },
        select: { id: true, status: true, voidedAt: true },
      });
      await this.audit(tx, operatorId, context, 'school_invoice_voided', schoolId, input.internalReason, { invoiceId });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private audit(tx: Prisma.TransactionClient, operatorId: string, context: PlatformActionContext, action: string, schoolId: string, reasonValue: string, metadata: Prisma.InputJsonValue) {
    return tx.platformAuditEvent.create({ data: {
      operatorId, action, success: true, targetType: 'CustomerSchool', targetId: schoolId,
      reason: reasonValue, metadata, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
    } });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
