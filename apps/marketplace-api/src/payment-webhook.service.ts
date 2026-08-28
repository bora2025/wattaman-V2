import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CommerceService } from './commerce.service';
import { MarketplaceConfig } from './config';
import { HttpError } from './http-error';

const eventSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9._-]{1,200}$/),
  type: z.enum(['payment.succeeded', 'payment.failed']),
  createdAt: z.string().datetime({ offset: true }),
  data: z.object({
    orderId: z.string().uuid(), providerReference: z.string().min(1).max(200),
    amountMinor: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  }).strict(),
}).strict();

export class PaymentWebhookService {
  private readonly commerce: CommerceService;
  constructor(private readonly prisma: PrismaClient, private readonly config: MarketplaceConfig) {
    this.commerce = new CommerceService(prisma, config);
  }

  async process(rawBody: Buffer, signatureHeader: string | undefined, now = new Date()) {
    const signature = verifyWebhookSignature(rawBody, signatureHeader, this.config.paymentWebhookSecret, now);
    const event = eventSchema.parse(JSON.parse(rawBody.toString('utf8')));
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    try {
      return await this.prisma.$transaction(async (tx) => {
      const prior = await tx.paymentWebhookEvent.findUnique({ where: { provider_eventId: { provider: 'online-hmac-v1', eventId: event.id } } });
      if (prior) {
        if (prior.payloadHash !== payloadHash) throw new HttpError(409, 'Webhook event id was reused with another payload');
        return { eventId: event.id, duplicate: true, processed: Boolean(prior.processedAt) };
      }
      const evidence = await tx.paymentWebhookEvent.create({ data: {
        provider: 'online-hmac-v1', eventId: event.id, payloadHash, rawPayload: rawBody.toString('base64'), signature,
        eventType: event.type, orderId: event.data.orderId,
      } });
      let result: unknown;
      if (event.type === 'payment.succeeded') {
        result = await this.commerce.settleProviderPayment(tx, {
          orderId: event.data.orderId, provider: 'online-hmac-v1', providerReference: event.data.providerReference,
          amountMinor: event.data.amountMinor,
        }, now);
      } else {
        result = await this.recordFailure(tx, event.data);
      }
      await tx.paymentWebhookEvent.update({ where: { id: evidence.id }, data: { processedAt: now } });
      return { eventId: event.id, duplicate: false, processed: true, result };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const committed = await this.prisma.paymentWebhookEvent.findUnique({
        where: { provider_eventId: { provider: 'online-hmac-v1', eventId: event.id } },
      });
      if (!committed || committed.payloadHash !== payloadHash) throw new HttpError(409, 'Webhook event id was reused with another payload');
      return { eventId: event.id, duplicate: true, processed: Boolean(committed.processedAt) };
    }
  }

  private async recordFailure(tx: Prisma.TransactionClient, data: z.infer<typeof eventSchema>['data']) {
    const order = await tx.marketplaceOrder.findUnique({ where: { id: data.orderId }, select: { id: true, status: true, currency: true, totalMinor: true } });
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.currency !== data.currency) throw new HttpError(409, 'Provider currency does not match order');
    const payment = await tx.marketplacePayment.findUnique({ where: { provider_providerRef: { provider: 'online-hmac-v1', providerRef: data.providerReference } } });
    if (payment && payment.orderId !== order.id) throw new HttpError(409, 'Payment reference belongs to another order');
    if (order.status === 'PAID' || payment?.status === 'SUCCEEDED') return { ignored: true, reason: 'payment already succeeded' };
    const stored = payment
      ? await tx.marketplacePayment.update({ where: { id: payment.id }, data: { status: 'FAILED', amountMinor: data.amountMinor } })
      : await tx.marketplacePayment.create({ data: { orderId: order.id, provider: 'online-hmac-v1', providerRef: data.providerReference, status: 'FAILED', amountMinor: data.amountMinor } });
    return { ignored: false, paymentId: stored.id, status: stored.status };
  }
}

export function paymentWebhookSignature(rawBody: Buffer, timestampSeconds: number, secret: string) {
  const digest = createHmac('sha256', secret).update(`${timestampSeconds}.`).update(rawBody).digest('hex');
  return `t=${timestampSeconds},v1=${digest}`;
}

function verifyWebhookSignature(rawBody: Buffer, header: string | undefined, secret: string, now: Date) {
  const match = /^t=(\d{10}),v1=([a-f0-9]{64})$/.exec(header ?? '');
  if (!match) throw new HttpError(401, 'Invalid payment webhook signature');
  const timestamp = Number(match[1]);
  if (Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > 300) throw new HttpError(401, 'Payment webhook timestamp is outside tolerance');
  const expected = paymentWebhookSignature(rawBody, timestamp, secret).slice(-64);
  const supplied = match[2];
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))) throw new HttpError(401, 'Invalid payment webhook signature');
  return header!;
}
