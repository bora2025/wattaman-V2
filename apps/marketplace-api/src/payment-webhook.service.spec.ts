import { createHash, generateKeyPairSync } from 'node:crypto';
import { PaymentWebhookService, paymentWebhookSignature } from './payment-webhook.service';

const now = new Date('2026-08-28T00:00:00.000Z');
const secret = 'webhook-secret-that-is-at-least-32-characters';
const event = {
  id: 'evt-2026-001', type: 'payment.failed', createdAt: now.toISOString(),
  data: { orderId: '00000000-0000-4000-8000-000000000004', providerReference: 'pay-001', amountMinor: 2500, currency: 'USD' },
};

function body(value: unknown = event) { return Buffer.from(JSON.stringify(value)); }
function signature(value: Buffer, at = now) { return paymentWebhookSignature(value, Math.floor(at.getTime() / 1000), secret); }
function service(tx: any) {
  const prisma = { $transaction: jest.fn((work: (value: any) => unknown) => work(tx)) } as any;
  return { instance: new PaymentWebhookService(prisma, { paymentWebhookSecret: secret } as any), prisma };
}

describe('authenticated payment webhooks', () => {
  it('rejects an invalid signature before opening a transaction', async () => {
    const { instance, prisma } = service({});
    await expect(instance.process(body(), `t=${Math.floor(now.getTime() / 1000)},v1=${'0'.repeat(64)}`, now)).rejects.toThrow('Invalid payment webhook signature');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a valid but stale signed event', async () => {
    const raw = body();
    const { instance, prisma } = service({});
    const old = new Date(now.getTime() - 301_000);
    await expect(instance.process(raw, signature(raw, old), now)).rejects.toThrow('outside tolerance');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deduplicates an exactly repeated event without processing it twice', async () => {
    const raw = body();
    const tx = { paymentWebhookEvent: { findUnique: jest.fn().mockResolvedValue({ payloadHash: createHash('sha256').update(raw).digest('hex'), processedAt: now }) } };
    const { instance } = service(tx);
    await expect(instance.process(raw, signature(raw), now)).resolves.toEqual({ eventId: event.id, duplicate: true, processed: true });
  });

  it('recovers an identical delivery that loses the concurrent unique-index race', async () => {
    const raw = body();
    const collision = Object.assign(new Error('unique'), { code: 'P2002' });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(collision),
      paymentWebhookEvent: { findUnique: jest.fn().mockResolvedValue({ payloadHash: createHash('sha256').update(raw).digest('hex'), processedAt: now }) },
    } as any;
    const instance = new PaymentWebhookService(prisma, { paymentWebhookSecret: secret } as any);
    await expect(instance.process(raw, signature(raw), now)).resolves.toEqual({ eventId: event.id, duplicate: true, processed: true });
  });

  it('rejects reuse of an event id with a different payload', async () => {
    const raw = body();
    const tx = { paymentWebhookEvent: { findUnique: jest.fn().mockResolvedValue({ payloadHash: 'f'.repeat(64), processedAt: now }) } };
    const { instance } = service(tx);
    await expect(instance.process(raw, signature(raw), now)).rejects.toThrow('reused with another payload');
  });

  it('retains a late failure but never reverses an already successful order', async () => {
    const raw = body();
    const tx = {
      paymentWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'evidence-1' }), update: jest.fn().mockResolvedValue({}),
      },
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue({ id: event.data.orderId, status: 'PAID', currency: 'USD', totalMinor: 2500 }) },
      marketplacePayment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: event.data.orderId, status: 'SUCCEEDED' }),
        create: jest.fn(), update: jest.fn(),
      },
    };
    const { instance } = service(tx);
    const result = await instance.process(raw, signature(raw), now);
    expect(result).toMatchObject({ duplicate: false, processed: true, result: { ignored: true } });
    expect(tx.paymentWebhookEvent.create.mock.calls[0][0].data.rawPayload).toBe(raw.toString('base64'));
    expect(tx.marketplacePayment.create).not.toHaveBeenCalled();
    expect(tx.marketplacePayment.update).not.toHaveBeenCalled();
  });

  it('allows a signed success after an earlier failure and fulfills exactly once', async () => {
    const success = { ...event, id: 'evt-2026-002', type: 'payment.succeeded' };
    const raw = body(success);
    const tx = {
      paymentWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'evidence-2' }), update: jest.fn().mockResolvedValue({}),
      },
      marketplacePayment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: event.data.orderId, status: 'FAILED', amountMinor: 2500 }),
        update: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: event.data.orderId, status: 'SUCCEEDED', amountMinor: 2500 }),
        create: jest.fn(),
      },
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: event.data.orderId, accountId: 'customer-1', installationId: 'installation-row-1', status: 'PENDING', totalMinor: 2500,
          account: {}, installation: { installationId: 'school-public-id' },
          lines: [{ id: 'line-1', pluginId: 'official.attendance', unitPriceMinor: 2500, entitlement: null, price: { amountMinor: 2500, licensedMajor: 1, licenseDays: 365, updatesDays: 180 } }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      installationEntitlement: { upsert: jest.fn().mockResolvedValue({ id: 'entitlement-1' }) },
    };
    const pair = generateKeyPairSync('ed25519');
    const key = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const prisma = { $transaction: jest.fn((work: (value: any) => unknown) => work(tx)) } as any;
    const instance = new PaymentWebhookService(prisma, {
      paymentWebhookSecret: secret, entitlementPrivateKey: key, entitlementKeyId: 'entitlement-1', publicBaseUrl: 'https://marketplace.example',
    } as any);
    const result = await instance.process(raw, signature(raw), now);
    expect(result).toMatchObject({ duplicate: false, processed: true, result: { status: 'PAID', entitlementIds: ['entitlement-1'] } });
    expect(tx.marketplacePayment.update).toHaveBeenCalledWith({ where: { id: 'payment-1' }, data: { status: 'SUCCEEDED', amountMinor: 2500 } });
    expect(tx.marketplaceOrder.update).toHaveBeenCalledWith({ where: { id: event.data.orderId }, data: { status: 'PAID' } });
  });
});
