import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import { recordSaleEntries } from './publisher-governance.service';
import { issueEntitlement, issueTerminalEntitlement } from './entitlement';
import { HttpError } from './http-error';

const orderInput = z.object({
  accountId: z.string().uuid(), installationId: z.string().uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  priceIds: z.array(z.string().uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, 'Duplicate prices are not allowed'),
  idempotencyKey: z.string().min(16).max(200),
  /** INVOICE bills the school's next subscription invoice and grants the entitlement now, on
   *  credit. See docs/decisions/school-invoice-plugin-credit-2026-09-10.md. */
  settlementMode: z.enum(['IMMEDIATE', 'INVOICE']).default('IMMEDIATE'),
}).strict();

const settlementInput = z.object({
  orderId: z.string().uuid(), providerReference: z.string().trim().min(1).max(200),
}).strict();

const refundInput = z.object({
  orderId: z.string().uuid(), reason: z.string().trim().min(1).max(500),
}).strict();

const revokeInput = z.object({
  entitlementId: z.string().uuid(), reason: z.string().trim().min(1).max(500),
}).strict();

export class CommerceService {
  constructor(private readonly prisma: PrismaClient, private readonly config: MarketplaceConfig) {}

  async createOrder(value: unknown, now = new Date()) {
    const input = orderInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.marketplaceOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } });
      if (existing) return existing;
      const [account, installation, prices] = await Promise.all([
        tx.marketplaceAccount.findUnique({ where: { id: input.accountId }, select: { id: true } }),
        tx.installationRegistration.findUnique({ where: { id: input.installationId }, select: { id: true, installationId: true, accountId: true, school: { select: { id: true, status: true, currency: true, billingAnchorAt: true, billingPlan: { select: { id: true, active: true, currency: true } } } } } }),
        tx.productPrice.findMany({ where: { id: { in: input.priceIds } }, include: { plugin: { select: { id: true, isPaid: true, status: true } } } }),
      ]);
      if (!account || !installation) throw new HttpError(404, 'Account or installation not found');
      if (installation.accountId !== input.accountId) throw new HttpError(403, 'Installation is not registered to this account');
      if (installation.school && installation.school.status !== 'ACTIVE') throw new HttpError(403, 'Customer school is not active');
      if (prices.length !== input.priceIds.length) throw new HttpError(400, 'One or more prices do not exist');
      const byId = new Map(prices.map((price) => [price.id, price]));
      const ordered = input.priceIds.map((id) => byId.get(id)!);
      for (const price of ordered) {
        if (price.currency !== input.currency || price.validFrom > now || (price.validUntil && price.validUntil <= now)) throw new HttpError(409, 'Price is not active for this order');
        if (!price.plugin.isPaid || price.plugin.status !== 'APPROVED') throw new HttpError(409, 'Product is not available for purchase');
      }
      const totalMinor = ordered.reduce((sum, price) => safeMinorTotal(sum, price.amountMinor), 0);
      if (input.settlementMode === 'INVOICE') assertInvoiceable(installation.school, input.currency);
      const order = await tx.marketplaceOrder.create({
        data: {
          accountId: input.accountId, installationId: input.installationId, currency: input.currency, totalMinor,
          idempotencyKey: input.idempotencyKey, settlementMode: input.settlementMode,
          lines: { create: ordered.map((price) => ({ pluginId: price.pluginId, priceId: price.id, unitPriceMinor: price.amountMinor })) },
        }, include: { lines: true },
      });
      if (input.settlementMode !== 'INVOICE') return order;
      // Bought on account: the entitlement is granted now and the charge lands on the school's next
      // subscription invoice. The order stays PENDING because no money has arrived -- settlementMode
      // is what says the difference between "not paid yet" and "not paid, and that is the deal".
      const withPrices = await tx.marketplaceOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { installation: { select: { installationId: true } }, lines: { include: { price: true, entitlement: true } } },
      });
      await this.fulfilOrderLines(tx, withPrices, now);
      return order;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async settleManualPayment(value: unknown, now = new Date()) {
    const input = settlementInput.parse(value);
    return this.prisma.$transaction(
      (tx) => this.settleProviderPayment(tx, { ...input, provider: 'manual' }, now),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async settleProviderPayment(
    tx: Prisma.TransactionClient,
    input: { orderId: string; provider: string; providerReference: string; amountMinor?: number },
    now = new Date(),
  ) {
      const priorPayment = await tx.marketplacePayment.findUnique({ where: { provider_providerRef: { provider: input.provider, providerRef: input.providerReference } } });
      if (priorPayment && priorPayment.orderId !== input.orderId) throw new HttpError(409, 'Payment reference belongs to another order');
      const order = await tx.marketplaceOrder.findUnique({
        where: { id: input.orderId }, include: { account: true, installation: true, lines: { include: { price: true, entitlement: true, plugin: { select: { publisherId: true } } } } },
      });
      if (!order) throw new HttpError(404, 'Order not found');
      if (order.status === 'PAID') return fulfillmentResult(order, priorPayment?.id);
      if (order.status !== 'PENDING') throw new HttpError(409, `Order cannot be paid from ${order.status}`);
      if (input.amountMinor !== undefined && input.amountMinor !== order.totalMinor) throw new HttpError(409, 'Provider amount does not settle the order total');
      const calculatedTotal = order.lines.reduce((sum, line) => safeMinorTotal(sum, line.unitPriceMinor), 0);
      if (calculatedTotal !== order.totalMinor) throw new HttpError(409, 'Order total does not match its immutable lines');
      for (const line of order.lines) if (line.unitPriceMinor !== line.price.amountMinor) throw new HttpError(409, 'Order line no longer matches its price snapshot');
      const payment = priorPayment
        ? await tx.marketplacePayment.update({ where: { id: priorPayment.id }, data: { status: 'SUCCEEDED', amountMinor: order.totalMinor } })
        : await tx.marketplacePayment.create({ data: { orderId: order.id, provider: input.provider, providerRef: input.providerReference, status: 'SUCCEEDED', amountMinor: order.totalMinor } });
      if (payment.status !== 'SUCCEEDED' || payment.amountMinor !== order.totalMinor) throw new HttpError(409, 'Payment does not settle the order total');
      const entitlementIds = await this.fulfilOrderLines(tx, order, now);
      await tx.marketplaceOrder.update({ where: { id: order.id }, data: { status: 'PAID' } });
      // The publisher's share, recorded with the money rather than by an operator remembering to
      // call an endpoint per order. Idempotent on (orderLineId, SALE), so a retried webhook cannot
      // pay a publisher twice.
      await recordSaleEntries(tx, order);
      const linkedRequest = await tx.schoolPluginRequest.findUnique({ where: { orderId: order.id } });
      if (linkedRequest) {
        if (linkedRequest.status !== 'APPROVED') throw new HttpError(409, `Linked plugin request cannot be fulfilled from ${linkedRequest.status}`);
        if (entitlementIds.length !== 1) throw new HttpError(409, 'A school plugin request order must fulfil exactly one entitlement');
        await tx.schoolPluginRequest.update({
          where: { id: linkedRequest.id },
          data: { status: 'ENTITLEMENT_ISSUED', entitlementId: entitlementIds[0], fulfilledAt: now },
        });
        await tx.platformAuditEvent.create({ data: {
          action: 'school_plugin_request_entitlement_issued_after_payment', targetType: 'SchoolPluginRequest',
          targetId: linkedRequest.id, reason: 'Verified payment settlement',
          metadata: { orderId: order.id, paymentId: payment.id, entitlementId: entitlementIds[0] },
        } });
      }
      return { orderId: order.id, status: 'PAID' as const, paymentId: payment.id, entitlementIds };
  }

  /**
   * Mints the entitlement for every line of an order that does not already have one.
   *
   * Shared by both settlement modes on purpose. An immediate order reaches it once money has
   * settled; an invoice order reaches it at approval, on credit. Two implementations of "grant the
   * thing they bought" would drift, and the one that drifted would be the one granting licences.
   *
   * Lines that already carry an entitlement are returned untouched, which is what makes a retried
   * webhook and a later settlement of an already-granted invoice order both safe.
   */
  private async fulfilOrderLines(
    tx: Prisma.TransactionClient,
    order: { id: string; accountId: string; installationId: string; installation: { installationId: string }; lines: Array<{ id: string; pluginId: string; price: { licenseDays: number; updatesDays: number; licensedMajor: number }; entitlement: { id: string } | null }> },
    now: Date,
  ): Promise<string[]> {
    const entitlementIds: string[] = [];
    for (const line of order.lines) {
      if (line.entitlement) { entitlementIds.push(line.entitlement.id); continue; }
      const previous = await tx.installationEntitlement.findUnique({
        where: { installationId_pluginId: { installationId: order.installationId, pluginId: line.pluginId } },
        select: { generation: true },
      });
      const generation = (previous?.generation ?? 0) + 1;
      const expiresAt = addDays(now, line.price.licenseDays);
      const updatesThrough = addDays(now, Math.min(line.price.updatesDays, line.price.licenseDays));
      const offlineRecheckAfter = addDays(now, Math.min(30, line.price.licenseDays));
      const token = issueEntitlement({
        generation, status: 'ACTIVE',
        installationId: order.installation.installationId, customerId: order.accountId, productId: line.pluginId,
        licensedMajorRange: `^${line.price.licensedMajor}.0.0`, notBefore: now.toISOString(), expiresAt: expiresAt.toISOString(),
        updatesThrough: updatesThrough.toISOString(), offlineRecheckAfter: offlineRecheckAfter.toISOString(), features: [], issuer: this.config.publicBaseUrl,
      }, this.config.entitlementPrivateKey, this.config.entitlementKeyId, now);
      const entitlement = await tx.installationEntitlement.upsert({
        where: { installationId_pluginId: { installationId: order.installationId, pluginId: line.pluginId } },
        create: {
          installationId: order.installationId, pluginId: line.pluginId, orderLineId: line.id, tokenId: token.payload.tokenId,
          generation, expiresAt, updatesThrough, offlineUntil: offlineRecheckAfter, signedToken: token as unknown as Prisma.InputJsonValue,
        },
        update: {
          status: 'ACTIVE', orderLineId: line.id, tokenId: token.payload.tokenId, revokedAt: null, revokedReason: null,
          generation, expiresAt, updatesThrough, offlineUntil: offlineRecheckAfter, signedToken: token as unknown as Prisma.InputJsonValue,
        },
      });
      entitlementIds.push(entitlement.id);
    }
    return entitlementIds;
  }

  async refundOrder(value: unknown, now = new Date()) {
    const input = refundInput.parse(value);
    return this.prisma.$transaction(
      (tx) => this.reverseOrder(tx, { orderId: input.orderId, reason: input.reason, initiatedBy: 'admin' }, now),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reverseOrder(
    tx: Prisma.TransactionClient,
    input: { orderId: string; reason: string; initiatedBy: 'admin' | 'dispute' },
    now = new Date(),
  ) {
    const order = await tx.marketplaceOrder.findUnique({
      where: { id: input.orderId },
      include: { lines: { include: { entitlement: true } }, payments: true, refunds: true },
    });
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.status === 'REFUNDED') {
      const existing = order.refunds[0];
      if (!existing) throw new HttpError(409, 'Order was refunded without a refund record');
      return { orderId: order.id, status: 'REFUNDED' as const, refundId: existing.id, entitlementIds: order.lines.filter((line) => line.entitlement).map((line) => line.entitlement!.id) };
    }
    if (order.status !== 'PAID') throw new HttpError(409, `Order cannot be refunded from ${order.status}`);
    const payment = order.payments.find((candidate) => candidate.status === 'SUCCEEDED');
    if (!payment) throw new HttpError(409, 'Order has no successful payment to refund');
    const refund = await tx.marketplaceRefund.create({
      data: { orderId: order.id, paymentId: payment.id, amountMinor: payment.amountMinor, reason: input.reason, initiatedBy: input.initiatedBy },
    });
    await tx.marketplacePayment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
    await tx.marketplaceOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
    const revokedStatus = input.initiatedBy === 'dispute' ? 'REVOKED' : 'REFUNDED';
    const entitlementIds: string[] = [];
    for (const line of order.lines) {
      if (!line.entitlement || line.entitlement.status !== 'ACTIVE') continue;
      const token = issueTerminalEntitlement(line.entitlement.signedToken, revokedStatus, this.config.entitlementPrivateKey, this.config.entitlementKeyId, now);
      await tx.installationEntitlement.update({
        where: { id: line.entitlement.id }, data: {
          status: revokedStatus, generation: token.payload.generation, tokenId: token.payload.tokenId,
          signedToken: token as unknown as Prisma.InputJsonValue, revokedAt: now, revokedReason: input.reason,
        },
      });
      entitlementIds.push(line.entitlement.id);
    }
    return { orderId: order.id, status: 'REFUNDED' as const, refundId: refund.id, entitlementIds };
  }

  async revokeEntitlement(value: unknown, now = new Date()) {
    const input = revokeInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const entitlement = await tx.installationEntitlement.findUnique({ where: { id: input.entitlementId } });
      if (!entitlement) throw new HttpError(404, 'Entitlement not found');
      if (entitlement.status !== 'ACTIVE') throw new HttpError(409, `Entitlement cannot be revoked from ${entitlement.status}`);
      const token = issueTerminalEntitlement(entitlement.signedToken, 'REVOKED', this.config.entitlementPrivateKey, this.config.entitlementKeyId, now);
      const updated = await tx.installationEntitlement.update({
        where: { id: entitlement.id }, data: {
          status: 'REVOKED', generation: token.payload.generation, tokenId: token.payload.tokenId,
          signedToken: token as unknown as Prisma.InputJsonValue, revokedAt: now, revokedReason: input.reason,
        },
      });
      return { entitlementId: updated.id, status: updated.status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async expireOverdueEntitlements(now = new Date()) {
    const overdue = await this.prisma.installationEntitlement.findMany({ where: { status: 'ACTIVE', expiresAt: { lt: now } } });
    for (const entitlement of overdue) {
      const token = issueTerminalEntitlement(entitlement.signedToken, 'EXPIRED', this.config.entitlementPrivateKey, this.config.entitlementKeyId, now);
      await this.prisma.installationEntitlement.update({ where: { id: entitlement.id }, data: {
        status: 'EXPIRED', generation: token.payload.generation, tokenId: token.payload.tokenId,
        signedToken: token as unknown as Prisma.InputJsonValue,
      } });
    }
    return { expiredCount: overdue.length };
  }
}

function safeMinorTotal(sum: number, amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new HttpError(409, 'Invalid price amount');
  const result = sum + amount;
  if (!Number.isSafeInteger(result)) throw new HttpError(409, 'Order total exceeds supported range');
  return result;
}

function addDays(value: Date, days: number) { return new Date(value.getTime() + days * 86_400_000); }

/**
 * What bounds buying on credit. A school with no next invoice has nothing to bill to, and a plugin
 * priced in another currency cannot join an invoice without an exchange rate -- which carries tax
 * and accounting consequences belonging to a decision nobody has made. Both are refused with the
 * reason named, never worked around silently.
 */
function assertInvoiceable(
  school: { status: string; currency: string | null; billingAnchorAt: Date | null; billingPlan: { active: boolean; currency: string } | null } | null,
  orderCurrency: string,
) {
  if (!school) throw new HttpError(409, 'This installation is not linked to a customer school, so it cannot be billed on account');
  if (school.status !== 'ACTIVE') throw new HttpError(403, 'Customer school is not active');
  if (!school.billingPlan?.active) throw new HttpError(409, 'This school has no active billing plan, so there is no invoice to bill to');
  if (!school.billingAnchorAt) throw new HttpError(409, 'This school has no billing anniversary set, so no invoice will be raised to carry the charge');
  const schoolCurrency = school.currency || school.billingPlan.currency;
  if (schoolCurrency !== orderCurrency) throw new HttpError(409, `This school is billed in ${schoolCurrency} and the price is in ${orderCurrency}; it cannot be added to that invoice`);
}

function fulfillmentResult(order: { id: string; lines: Array<{ entitlement: { id: string } | null }> }, paymentId?: string) {
  if (!paymentId || order.lines.some((line) => !line.entitlement)) throw new HttpError(409, 'Paid order fulfillment is incomplete');
  return { orderId: order.id, status: 'PAID' as const, paymentId, entitlementIds: order.lines.map((line) => line.entitlement!.id) };
}
