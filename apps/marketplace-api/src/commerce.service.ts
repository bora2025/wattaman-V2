import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import { issueEntitlement } from './entitlement';
import { HttpError } from './http-error';

const orderInput = z.object({
  accountId: z.string().uuid(), installationId: z.string().uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  priceIds: z.array(z.string().uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, 'Duplicate prices are not allowed'),
  idempotencyKey: z.string().min(16).max(200),
}).strict();

const settlementInput = z.object({
  orderId: z.string().uuid(), providerReference: z.string().trim().min(1).max(200),
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
        tx.installationRegistration.findUnique({ where: { id: input.installationId }, select: { id: true } }),
        tx.productPrice.findMany({ where: { id: { in: input.priceIds } }, include: { plugin: { select: { id: true, isPaid: true, status: true } } } }),
      ]);
      if (!account || !installation) throw new HttpError(404, 'Account or installation not found');
      if (prices.length !== input.priceIds.length) throw new HttpError(400, 'One or more prices do not exist');
      const byId = new Map(prices.map((price) => [price.id, price]));
      const ordered = input.priceIds.map((id) => byId.get(id)!);
      for (const price of ordered) {
        if (price.currency !== input.currency || price.validFrom > now || (price.validUntil && price.validUntil <= now)) throw new HttpError(409, 'Price is not active for this order');
        if (!price.plugin.isPaid || price.plugin.status !== 'APPROVED') throw new HttpError(409, 'Product is not available for purchase');
      }
      const totalMinor = ordered.reduce((sum, price) => safeMinorTotal(sum, price.amountMinor), 0);
      return tx.marketplaceOrder.create({
        data: {
          accountId: input.accountId, installationId: input.installationId, currency: input.currency, totalMinor,
          idempotencyKey: input.idempotencyKey,
          lines: { create: ordered.map((price) => ({ pluginId: price.pluginId, priceId: price.id, unitPriceMinor: price.amountMinor })) },
        }, include: { lines: true },
      });
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
        where: { id: input.orderId }, include: { account: true, installation: true, lines: { include: { price: true, entitlement: true } } },
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
      const entitlementIds: string[] = [];
      for (const line of order.lines) {
        if (line.entitlement) { entitlementIds.push(line.entitlement.id); continue; }
        const expiresAt = addDays(now, line.price.licenseDays);
        const updatesThrough = addDays(now, Math.min(line.price.updatesDays, line.price.licenseDays));
        const offlineRecheckAfter = addDays(now, Math.min(30, line.price.licenseDays));
        const token = issueEntitlement({
          installationId: order.installation.installationId, customerId: order.accountId, productId: line.pluginId,
          licensedMajorRange: `^${line.price.licensedMajor}.0.0`, notBefore: now.toISOString(), expiresAt: expiresAt.toISOString(),
          updatesThrough: updatesThrough.toISOString(), offlineRecheckAfter: offlineRecheckAfter.toISOString(), features: [], issuer: this.config.publicBaseUrl,
        }, this.config.entitlementPrivateKey, this.config.entitlementKeyId, now);
        const entitlement = await tx.installationEntitlement.upsert({
          where: { installationId_pluginId: { installationId: order.installationId, pluginId: line.pluginId } },
          create: { installationId: order.installationId, pluginId: line.pluginId, orderLineId: line.id, tokenId: token.payload.tokenId, updatesThrough, offlineUntil: offlineRecheckAfter, signedToken: token as unknown as Prisma.InputJsonValue },
          update: { status: 'ACTIVE', orderLineId: line.id, tokenId: token.payload.tokenId, updatesThrough, offlineUntil: offlineRecheckAfter, signedToken: token as unknown as Prisma.InputJsonValue },
        });
        entitlementIds.push(entitlement.id);
      }
      await tx.marketplaceOrder.update({ where: { id: order.id }, data: { status: 'PAID' } });
      return { orderId: order.id, status: 'PAID' as const, paymentId: payment.id, entitlementIds };
  }
}

function safeMinorTotal(sum: number, amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new HttpError(409, 'Invalid price amount');
  const result = sum + amount;
  if (!Number.isSafeInteger(result)) throw new HttpError(409, 'Order total exceeds supported range');
  return result;
}

function addDays(value: Date, days: number) { return new Date(value.getTime() + days * 86_400_000); }

function fulfillmentResult(order: { id: string; lines: Array<{ entitlement: { id: string } | null }> }, paymentId?: string) {
  if (!paymentId || order.lines.some((line) => !line.entitlement)) throw new HttpError(409, 'Paid order fulfillment is incomplete');
  return { orderId: order.id, status: 'PAID' as const, paymentId, entitlementIds: order.lines.map((line) => line.entitlement!.id) };
}
