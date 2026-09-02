import { Prisma, PrismaClient, SchoolPluginRequestDecisionType, SchoolPluginRequestStatus, SchoolPluginRequestType } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { MarketplaceConfig } from './config';
import { CommerceService } from './commerce.service';
import { issueEntitlement } from './entitlement';
import { PlatformActionContext } from './platform-context';
import { cursorClause, maskEmail, pageInput, paginate } from './platform-read-support';

const createInput = z.object({
  installationId: z.string().uuid(),
  pluginId: z.string().min(1).max(100).optional(),
  type: z.nativeEnum(SchoolPluginRequestType),
  justification: z.string().trim().min(10).max(5000),
  intendedUsers: z.number().int().min(1).max(1_000_000).optional(),
  desiredAt: z.coerce.date().optional(),
  contactEmail: z.string().email().max(320).optional(),
  featureDescription: z.string().trim().min(10).max(10_000).optional(),
}).strict();

const requestFilter = pageInput.extend({
  status: z.nativeEnum(SchoolPluginRequestStatus).optional(),
  type: z.nativeEnum(SchoolPluginRequestType).optional(),
  assigned: z.enum(['me', 'unassigned']).optional(),
});

const decisionInput = z.object({
  idempotencyKey: z.string().min(16).max(200),
  publicMessage: z.string().trim().min(1).max(5000).optional(),
  internalReason: z.string().trim().min(3).max(5000),
}).strict();

const assignInput = z.object({
  operatorId: z.string().uuid(), idempotencyKey: z.string().min(16).max(200),
  internalReason: z.string().trim().min(3).max(5000),
}).strict();

const customerResponseInput = z.object({
  idempotencyKey: z.string().min(16).max(200), body: z.string().trim().min(1).max(5000),
}).strict();

const customerCancelInput = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

const fulfillInput = decisionInput.extend({ currency: z.string().regex(/^[A-Z]{3}$/).optional() }).strict();

const SLA_BUSINESS_DAYS: Record<SchoolPluginRequestType, number> = {
  FREE_APPROVAL: 2, PURCHASE_ASSISTANCE: 2, PRIVATE_PLUGIN_ACCESS: 3, TRIAL: 1, FEATURE_REQUEST: 2,
};

function addBusinessDays(from: Date, days: number) {
  const result = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result;
}

const TERMINAL = new Set<SchoolPluginRequestStatus>(['REJECTED', 'CANCELLED', 'ENTITLEMENT_ISSUED']);

export class SchoolPluginRequestService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config?: MarketplaceConfig,
    private readonly commerce?: CommerceService,
  ) {}

  async create(accountId: string, value: unknown, now = new Date()) {
    const input = createInput.parse(value);
    const [account, installation, plugin] = await Promise.all([
      this.prisma.marketplaceAccount.findUnique({ where: { id: accountId }, select: { email: true, emailVerifiedAt: true } }),
      this.prisma.installationRegistration.findUnique({ where: { installationId: input.installationId }, select: { id: true, accountId: true } }),
      input.pluginId ? this.prisma.marketplacePlugin.findUnique({ where: { id: input.pluginId }, select: { id: true, status: true } }) : null,
    ]);
    if (!account?.emailVerifiedAt) throw new HttpError(403, 'A verified marketplace account is required');
    if (!installation || installation.accountId !== accountId) throw new HttpError(403, 'Installation is not registered to this account');
    if (input.type === 'FEATURE_REQUEST') {
      if (input.pluginId || !input.featureDescription) throw new HttpError(400, 'A feature request requires featureDescription and cannot name an existing plugin');
    } else if (!plugin || plugin.status !== 'APPROVED') {
      throw new HttpError(400, 'This request type requires an approved catalog plugin');
    }
    if (input.type === 'TRIAL') {
      const previous = await this.prisma.schoolPluginRequest.findFirst({
        where: {
          installationId: installation.id, pluginId: input.pluginId, type: 'TRIAL',
          createdAt: { gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) },
          status: { notIn: ['REJECTED', 'CANCELLED'] },
        }, select: { id: true },
      });
      if (previous) throw new HttpError(409, 'This installation already requested a trial for this plugin within 365 days');
    }
    return this.prisma.schoolPluginRequest.create({
      data: {
        accountId, installationId: installation.id, pluginId: input.pluginId, type: input.type,
        justification: input.justification, intendedUsers: input.intendedUsers, desiredAt: input.desiredAt,
        contactEmail: (input.contactEmail || account.email).toLowerCase(), featureDescription: input.featureDescription,
        slaDueAt: addBusinessDays(now, SLA_BUSINESS_DAYS[input.type]), submittedAt: now,
      },
      select: { id: true, type: true, status: true, pluginId: true, submittedAt: true, slaDueAt: true },
    });
  }

  customerRequests(accountId: string) {
    return this.prisma.schoolPluginRequest.findMany({
      where: { accountId }, orderBy: { submittedAt: 'desc' }, take: 100,
      select: {
        id: true, type: true, status: true, justification: true, intendedUsers: true, desiredAt: true,
        featureDescription: true, submittedAt: true, slaDueAt: true, decidedAt: true, fulfilledAt: true,
        installation: { select: { installationId: true, label: true } },
        plugin: { select: { id: true, name: true } },
        messages: { where: { visibility: 'CUSTOMER' }, select: { id: true, body: true, createdAt: true, accountAuthorId: true, operatorAuthorId: true }, orderBy: { createdAt: 'asc' } },
        decisions: { select: { id: true, decision: true, publicMessage: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async customerRespond(accountId: string, requestId: string, value: unknown, now = new Date()) {
    const input = customerResponseInput.parse(value);
    return this.prisma.$transaction(async tx => {
      const replay = await tx.schoolPluginRequestMessage.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) {
        if (replay.requestId !== requestId || replay.accountAuthorId !== accountId) throw new HttpError(409, 'Idempotency key was already used for another message');
        return tx.schoolPluginRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, updatedAt: true } });
      }
      const request = await tx.schoolPluginRequest.findUnique({ where: { id: requestId } });
      if (!request || request.accountId !== accountId) throw new HttpError(404, 'School plugin request not found');
      if (request.status !== 'NEEDS_INFORMATION') throw new HttpError(409, `Request cannot accept customer information from ${request.status}`);
      await tx.schoolPluginRequestMessage.create({ data: {
        requestId, visibility: 'CUSTOMER', body: input.body, accountAuthorId: accountId,
        idempotencyKey: input.idempotencyKey, createdAt: now,
      } });
      const updated = await tx.schoolPluginRequest.update({ where: { id: requestId }, data: { status: 'UNDER_REVIEW' } });
      await tx.marketplaceAuditEvent.create({ data: {
        accountId, action: 'school_plugin_request_information_provided', success: true,
        metadata: { requestId, from: request.status, to: updated.status },
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async customerCancel(accountId: string, requestId: string, value: unknown, now = new Date()) {
    const input = customerCancelInput.parse(value);
    return this.prisma.$transaction(async tx => {
      const request = await tx.schoolPluginRequest.findUnique({ where: { id: requestId } });
      if (!request || request.accountId !== accountId) throw new HttpError(404, 'School plugin request not found');
      if (request.status === 'CANCELLED') return request;
      if (TERMINAL.has(request.status)) throw new HttpError(409, `Request cannot be cancelled from ${request.status}`);
      const updated = await tx.schoolPluginRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', cancelledAt: now } });
      await tx.marketplaceAuditEvent.create({ data: {
        accountId, action: 'school_plugin_request_cancelled', success: true,
        metadata: { requestId, from: request.status, to: updated.status, reason: input.reason },
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async platformRequests(query: unknown, operatorId: string) {
    const input = requestFilter.parse(query);
    const rows = await this.prisma.schoolPluginRequest.findMany({
      take: input.limit + 1, ...cursorClause(input.cursor), orderBy: { id: 'asc' },
      where: {
        ...(input.status ? { status: input.status } : {}), ...(input.type ? { type: input.type } : {}),
        ...(input.assigned === 'me' ? { assignedOperatorId: operatorId } : {}),
        ...(input.assigned === 'unassigned' ? { assignedOperatorId: null } : {}),
      },
      select: {
        id: true, type: true, status: true, submittedAt: true, slaDueAt: true, desiredAt: true,
        account: { select: { id: true, displayName: true, email: true } },
        installation: { select: { id: true, installationId: true, label: true } },
        plugin: { select: { id: true, name: true, isPaid: true } },
        assignedOperator: { select: { id: true, displayName: true } },
      },
    });
    return paginate(rows.map(row => ({ ...row, account: { ...row.account, email: maskEmail(row.account.email) } })), input.limit, row => row.id);
  }

  async platformRequest(requestId: string) {
    const request = await this.prisma.schoolPluginRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true, type: true, status: true, justification: true, intendedUsers: true, desiredAt: true,
        contactEmail: true, featureDescription: true, submittedAt: true, slaDueAt: true, decidedAt: true,
        fulfilledAt: true, cancelledAt: true, createdAt: true, updatedAt: true,
        account: { select: { id: true, displayName: true, email: true } },
        installation: { select: { id: true, installationId: true, label: true } },
        plugin: { select: { id: true, name: true, isPaid: true, status: true } },
        assignedOperator: { select: { id: true, displayName: true, email: true } },
        decisions: { select: { id: true, decision: true, publicMessage: true, internalReason: true, conditions: true, createdAt: true, operator: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'asc' } },
        messages: { select: { id: true, visibility: true, body: true, createdAt: true, accountAuthorId: true, operatorAuthorId: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new HttpError(404, 'School plugin request not found');
    return {
      ...request, contactEmail: maskEmail(request.contactEmail), account: { ...request.account, email: maskEmail(request.account.email) },
      assignedOperator: request.assignedOperator ? { ...request.assignedOperator, email: maskEmail(request.assignedOperator.email) } : null,
    };
  }

  async assign(requestId: string, actorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = assignInput.parse(value);
    const target = await this.prisma.platformOperator.findUnique({ where: { id: input.operatorId }, select: { id: true, status: true } });
    if (!target || target.status !== 'ACTIVE') throw new HttpError(400, 'Assignee must be an active platform operator');
    return this.transition(requestId, actorId, 'ASSIGNED', ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED'],
      { assignedOperatorId: input.operatorId }, input, context, now, { assignedOperatorId: input.operatorId });
  }

  startReview(requestId: string, actorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = decisionInput.parse(value);
    return this.transition(requestId, actorId, 'STARTED_REVIEW', ['SUBMITTED', 'NEEDS_INFORMATION'],
      { status: 'UNDER_REVIEW', assignedOperatorId: actorId }, input, context, now);
  }

  requestInformation(requestId: string, actorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = decisionInput.parse(value);
    if (!input.publicMessage) throw new HttpError(400, 'A customer-visible information request is required');
    return this.transition(requestId, actorId, 'INFORMATION_REQUESTED', ['SUBMITTED', 'UNDER_REVIEW'],
      { status: 'NEEDS_INFORMATION' }, input, context, now, undefined, input.publicMessage);
  }

  approve(requestId: string, actorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = decisionInput.parse(value);
    return this.transition(requestId, actorId, 'APPROVED', ['UNDER_REVIEW'], { status: 'APPROVED', decidedAt: now }, input, context, now,
      { trialDays: 30, entitlementIssued: false, localInstallationRequired: true });
  }

  reject(requestId: string, actorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = decisionInput.parse(value);
    if (!input.publicMessage) throw new HttpError(400, 'A customer-visible rejection explanation is required');
    return this.transition(requestId, actorId, 'REJECTED', ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION'],
      { status: 'REJECTED', decidedAt: now }, input, context, now, undefined, input.publicMessage);
  }

  async fulfill(requestId: string, actorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = fulfillInput.parse(value);
    const request = await this.prisma.schoolPluginRequest.findUnique({
      where: { id: requestId },
      include: {
        installation: { select: { id: true, installationId: true } },
        plugin: { include: { prices: { where: { validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, orderBy: [{ currency: 'asc' }, { amountMinor: 'asc' }] } } },
      },
    });
    if (!request) throw new HttpError(404, 'School plugin request not found');
    if (request.status === 'ENTITLEMENT_ISSUED') return request;
    if (request.status !== 'APPROVED') throw new HttpError(409, `Request cannot be fulfilled from ${request.status}`);
    if (request.type === 'FEATURE_REQUEST') throw new HttpError(409, 'A feature request is product feedback and cannot issue an entitlement');
    if (!request.plugin) throw new HttpError(409, 'Request has no plugin to fulfil');
    if (request.type === 'PURCHASE_ASSISTANCE') return this.createPurchaseOrder(request, actorId, input, context, now);
    if ((request.type === 'FREE_APPROVAL' || request.type === 'PRIVATE_PLUGIN_ACCESS') && request.plugin.isPaid) {
      throw new HttpError(409, 'A paid plugin requires purchase assistance and settled payment');
    }
    return this.issueRequestEntitlement(request, actorId, input, context, now);
  }

  private async createPurchaseOrder(
    request: any, actorId: string, input: z.infer<typeof fulfillInput>, context: PlatformActionContext, now: Date,
  ) {
    if (request.orderId) return request;
    if (!this.commerce) throw new HttpError(503, 'Commerce fulfilment is not configured');
    const price = request.plugin.prices.find((candidate: { currency: string }) => !input.currency || candidate.currency === input.currency);
    if (!price) throw new HttpError(409, input.currency ? `No active ${input.currency} price is available` : 'No active price is available');
    const order = await this.commerce.createOrder({
      accountId: request.accountId, installationId: request.installationId, currency: price.currency,
      priceIds: [price.id], idempotencyKey: `plugin-request:${request.id}`,
    }, now);
    return this.prisma.$transaction(async tx => {
      const current = await tx.schoolPluginRequest.findUnique({ where: { id: request.id } });
      if (!current) throw new HttpError(404, 'School plugin request not found');
      if (current.orderId) return current;
      if (current.status !== 'APPROVED') throw new HttpError(409, `Request cannot create an order from ${current.status}`);
      const replay = await tx.schoolPluginRequestDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay && (replay.requestId !== request.id || replay.decision !== 'ORDER_CREATED')) throw new HttpError(409, 'Idempotency key was already used for another action');
      const updated = await tx.schoolPluginRequest.update({ where: { id: request.id }, data: { orderId: order.id } });
      if (!replay) await tx.schoolPluginRequestDecision.create({ data: {
        requestId: request.id, operatorId: actorId, decision: 'ORDER_CREATED', publicMessage: input.publicMessage,
        internalReason: input.internalReason, conditions: { orderId: order.id, currency: price.currency, amountMinor: price.amountMinor },
        idempotencyKey: input.idempotencyKey, createdAt: now,
      } });
      await tx.platformAuditEvent.create({ data: {
        operatorId: actorId, action: 'school_plugin_request_order_created', targetType: 'SchoolPluginRequest', targetId: request.id,
        reason: input.internalReason, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
        metadata: { orderId: order.id, currency: price.currency, amountMinor: price.amountMinor },
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async issueRequestEntitlement(
    request: any, actorId: string, input: z.infer<typeof fulfillInput>, context: PlatformActionContext, now: Date,
  ) {
    if (!this.config?.entitlementPrivateKey || !this.config.entitlementKeyId) throw new HttpError(503, 'Entitlement signing is not configured');
    const validityDays = request.type === 'TRIAL' ? 30 : 3650;
    const expiresAt = new Date(now.getTime() + validityDays * 86_400_000);
    const offlineUntil = new Date(now.getTime() + Math.min(30, validityDays) * 86_400_000);
    return this.prisma.$transaction(async tx => {
      const current = await tx.schoolPluginRequest.findUnique({ where: { id: request.id } });
      if (!current) throw new HttpError(404, 'School plugin request not found');
      if (current.status === 'ENTITLEMENT_ISSUED') return current;
      if (current.status !== 'APPROVED') throw new HttpError(409, `Request cannot issue an entitlement from ${current.status}`);
      const replay = await tx.schoolPluginRequestDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay && (replay.requestId !== request.id || replay.decision !== 'ENTITLEMENT_ISSUED')) throw new HttpError(409, 'Idempotency key was already used for another action');
      const existing = await tx.installationEntitlement.findUnique({ where: { installationId_pluginId: { installationId: request.installationId, pluginId: request.pluginId } } });
      let entitlement = existing;
      if (!entitlement) {
        const token = issueEntitlement({
          installationId: request.installation.installationId, customerId: request.accountId, productId: request.pluginId,
          licensedMajorRange: '^1.0.0', notBefore: now.toISOString(), expiresAt: expiresAt.toISOString(),
          updatesThrough: expiresAt.toISOString(), offlineRecheckAfter: offlineUntil.toISOString(), features: [], issuer: this.config!.publicBaseUrl,
        }, this.config!.entitlementPrivateKey, this.config!.entitlementKeyId, now);
        entitlement = await tx.installationEntitlement.create({ data: {
          installationId: request.installationId, pluginId: request.pluginId, tokenId: token.payload.tokenId,
          expiresAt, updatesThrough: expiresAt, offlineUntil, signedToken: token as unknown as Prisma.InputJsonValue,
        } });
      } else if (entitlement.status !== 'ACTIVE') {
        throw new HttpError(409, 'An existing non-active entitlement requires a separately reviewed correction');
      }
      const updated = await tx.schoolPluginRequest.update({
        where: { id: request.id }, data: { status: 'ENTITLEMENT_ISSUED', entitlementId: entitlement.id, fulfilledAt: now },
      });
      if (!replay) await tx.schoolPluginRequestDecision.create({ data: {
        requestId: request.id, operatorId: actorId, decision: 'ENTITLEMENT_ISSUED', publicMessage: input.publicMessage,
        internalReason: input.internalReason, conditions: { entitlementId: entitlement.id, validityDays, localInstallationRequired: true },
        idempotencyKey: input.idempotencyKey, createdAt: now,
      } });
      await tx.platformAuditEvent.create({ data: {
        operatorId: actorId, action: 'school_plugin_request_entitlement_issued', targetType: 'SchoolPluginRequest', targetId: request.id,
        reason: input.internalReason, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
        metadata: { entitlementId: entitlement.id, validityDays },
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async transition(
    requestId: string, actorId: string, decision: SchoolPluginRequestDecisionType,
    allowed: SchoolPluginRequestStatus[], update: Prisma.SchoolPluginRequestUncheckedUpdateInput,
    input: { idempotencyKey: string; publicMessage?: string; internalReason: string },
    context: PlatformActionContext, now: Date, conditions?: Prisma.InputJsonValue, customerMessage?: string,
  ) {
    return this.prisma.$transaction(async tx => {
      const replay = await tx.schoolPluginRequestDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) {
        if (replay.requestId !== requestId || replay.decision !== decision) throw new HttpError(409, 'Idempotency key was already used for another action');
        return tx.schoolPluginRequest.findUnique({ where: { id: requestId } });
      }
      const current = await tx.schoolPluginRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new HttpError(404, 'School plugin request not found');
      if (TERMINAL.has(current.status) || !allowed.includes(current.status)) throw new HttpError(409, `Request cannot apply ${decision} from ${current.status}`);
      const updated = await tx.schoolPluginRequest.update({ where: { id: requestId }, data: update });
      await tx.schoolPluginRequestDecision.create({ data: {
        requestId, operatorId: actorId, decision, publicMessage: input.publicMessage,
        internalReason: input.internalReason, conditions, idempotencyKey: input.idempotencyKey, createdAt: now,
      } });
      if (customerMessage) await tx.schoolPluginRequestMessage.create({ data: { requestId, visibility: 'CUSTOMER', body: customerMessage, operatorAuthorId: actorId, createdAt: now } });
      await tx.platformAuditEvent.create({ data: {
        operatorId: actorId, action: `school_plugin_request_${decision.toLowerCase()}`, targetType: 'SchoolPluginRequest',
        targetId: requestId, reason: input.internalReason, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
        metadata: { from: current.status, to: updated.status },
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
