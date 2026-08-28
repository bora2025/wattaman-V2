import { generateKeyPairSync } from 'node:crypto';
import { CommerceService } from './commerce.service';

const ids = {
  account: '00000000-0000-4000-8000-000000000001', installation: '00000000-0000-4000-8000-000000000002',
  price: '00000000-0000-4000-8000-000000000003', order: '00000000-0000-4000-8000-000000000004',
};

function config() {
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { publicBaseUrl: 'https://marketplace.example', entitlementPrivateKey: key, entitlementKeyId: 'entitlement-1' } as any;
}

function prismaWith(tx: any) {
  return { $transaction: jest.fn((work: (value: any) => unknown) => work(tx)) } as any;
}

describe('marketplace commerce invariants', () => {
  it('creates an idempotent order using only the active server price', async () => {
    const created = { id: ids.order, totalMinor: 2500, lines: [{ unitPriceMinor: 2500 }] };
    const tx = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: ids.account }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: ids.installation }) },
      productPrice: { findMany: jest.fn().mockResolvedValue([{
        id: ids.price, pluginId: 'official.attendance', currency: 'USD', amountMinor: 2500,
        validFrom: new Date('2026-01-01Z'), validUntil: null, plugin: { id: 'official.attendance', isPaid: true, status: 'APPROVED' },
      }]) },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.createOrder({
      accountId: ids.account, installationId: ids.installation, currency: 'USD', priceIds: [ids.price], idempotencyKey: 'checkout-request-0001',
    }, new Date('2026-08-28Z'))).resolves.toEqual(created);
    expect(tx.marketplaceOrder.create.mock.calls[0][0].data.totalMinor).toBe(2500);
    expect(tx.marketplaceOrder.create.mock.calls[0][0].data.lines.create[0]).toMatchObject({ priceId: ids.price, unitPriceMinor: 2500 });
  });

  it('commits payment, entitlement, and paid order in the same transaction', async () => {
    const line = {
      id: 'line-1', pluginId: 'official.attendance', unitPriceMinor: 2500, entitlement: null,
      price: { amountMinor: 2500, licensedMajor: 1, licenseDays: 365, updatesDays: 180 },
    };
    const tx = {
      marketplacePayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: ids.order, status: 'SUCCEEDED', amountMinor: 2500 }) },
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: ids.order, accountId: ids.account, installationId: ids.installation, status: 'PENDING', totalMinor: 2500, account: {}, installation: { installationId: 'school-public-id' }, lines: [line] }),
        update: jest.fn().mockResolvedValue({}),
      },
      installationEntitlement: { upsert: jest.fn().mockResolvedValue({ id: 'entitlement-1' }) },
    };
    const service = new CommerceService(prismaWith(tx), config());
    const result = await service.settleManualPayment({ orderId: ids.order, providerReference: 'invoice-2026-001' }, new Date('2026-08-28Z'));
    expect(result).toEqual({ orderId: ids.order, status: 'PAID', paymentId: 'payment-1', entitlementIds: ['entitlement-1'] });
    const token = tx.installationEntitlement.upsert.mock.calls[0][0].create.signedToken;
    expect(token.payload).toMatchObject({ installationId: 'school-public-id', productId: 'official.attendance', licensedMajorRange: '^1.0.0' });
    expect(tx.marketplaceOrder.update).toHaveBeenCalledWith({ where: { id: ids.order }, data: { status: 'PAID' } });
  });

  it('does not record payment when immutable line totals disagree', async () => {
    const tx = {
      marketplacePayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue({
        id: ids.order, accountId: ids.account, installationId: ids.installation, status: 'PENDING', totalMinor: 2600,
        account: {}, installation: { installationId: 'school-public-id' }, lines: [{ id: 'line-1', pluginId: 'official.attendance', unitPriceMinor: 2500, entitlement: null, price: { amountMinor: 2500 } }],
      }) },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.settleManualPayment({ orderId: ids.order, providerReference: 'invoice-2026-002' })).rejects.toThrow('total does not match');
    expect(tx.marketplacePayment.create).not.toHaveBeenCalled();
  });

  it('returns the original fulfillment without issuing again on an idempotent retry', async () => {
    const tx = {
      marketplacePayment: { findUnique: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: ids.order, status: 'SUCCEEDED', amountMinor: 2500 }), create: jest.fn() },
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue({
        id: ids.order, status: 'PAID', account: {}, installation: { installationId: 'school-public-id' },
        lines: [{ entitlement: { id: 'entitlement-1' } }],
      }), update: jest.fn() },
      installationEntitlement: { upsert: jest.fn() },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.settleManualPayment({ orderId: ids.order, providerReference: 'invoice-2026-001' }))
      .resolves.toEqual({ orderId: ids.order, status: 'PAID', paymentId: 'payment-1', entitlementIds: ['entitlement-1'] });
    expect(tx.marketplacePayment.create).not.toHaveBeenCalled();
    expect(tx.installationEntitlement.upsert).not.toHaveBeenCalled();
    expect(tx.marketplaceOrder.update).not.toHaveBeenCalled();
  });
});
