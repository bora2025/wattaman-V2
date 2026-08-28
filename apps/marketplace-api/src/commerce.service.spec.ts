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

describe('marketplace refund, revocation, and expiry policy', () => {
  function paidOrder(overrides: Partial<{ status: string; entitlementStatus: string; paymentStatus: string; refunds: unknown[] }> = {}) {
    return {
      id: ids.order, status: overrides.status ?? 'PAID', refunds: overrides.refunds ?? [],
      payments: [{ id: 'payment-1', status: overrides.paymentStatus ?? 'SUCCEEDED', amountMinor: 2500 }],
      lines: [{ id: 'line-1', entitlement: { id: 'entitlement-1', status: overrides.entitlementStatus ?? 'ACTIVE' } }],
    };
  }

  it('refunds a paid order, downgrades payment and order, and refunds the active entitlement', async () => {
    const tx = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(paidOrder()), update: jest.fn().mockResolvedValue({}) },
      marketplaceRefund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
      marketplacePayment: { update: jest.fn().mockResolvedValue({}) },
      installationEntitlement: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new CommerceService(prismaWith(tx), config());
    const now = new Date('2026-09-01Z');
    await expect(service.refundOrder({ orderId: ids.order, reason: 'customer requested cancellation' }, now))
      .resolves.toEqual({ orderId: ids.order, status: 'REFUNDED', refundId: 'refund-1', entitlementIds: ['entitlement-1'] });
    expect(tx.marketplaceRefund.create.mock.calls[0][0].data).toMatchObject({ orderId: ids.order, paymentId: 'payment-1', amountMinor: 2500, initiatedBy: 'admin' });
    expect(tx.marketplacePayment.update).toHaveBeenCalledWith({ where: { id: 'payment-1' }, data: { status: 'REFUNDED' } });
    expect(tx.marketplaceOrder.update).toHaveBeenCalledWith({ where: { id: ids.order }, data: { status: 'REFUNDED' } });
    expect(tx.installationEntitlement.update).toHaveBeenCalledWith({
      where: { id: 'entitlement-1' }, data: { status: 'REFUNDED', revokedAt: now, revokedReason: 'customer requested cancellation' },
    });
  });

  it('returns the recorded refund without reprocessing an already-refunded order', async () => {
    const tx = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(paidOrder({ status: 'REFUNDED', refunds: [{ id: 'refund-1' }] })), update: jest.fn() },
      marketplaceRefund: { create: jest.fn() },
      marketplacePayment: { update: jest.fn() },
      installationEntitlement: { update: jest.fn() },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.refundOrder({ orderId: ids.order, reason: 'retry' }))
      .resolves.toEqual({ orderId: ids.order, status: 'REFUNDED', refundId: 'refund-1', entitlementIds: ['entitlement-1'] });
    expect(tx.marketplaceRefund.create).not.toHaveBeenCalled();
    expect(tx.marketplacePayment.update).not.toHaveBeenCalled();
  });

  it('rejects refunding an order that was never paid', async () => {
    const tx = { marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(paidOrder({ status: 'PENDING' })) } };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.refundOrder({ orderId: ids.order, reason: 'mistaken order' })).rejects.toThrow('cannot be refunded from PENDING');
  });

  it('leaves an already-terminal entitlement untouched when refunding its order', async () => {
    const tx = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(paidOrder({ entitlementStatus: 'EXPIRED' })), update: jest.fn().mockResolvedValue({}) },
      marketplaceRefund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
      marketplacePayment: { update: jest.fn().mockResolvedValue({}) },
      installationEntitlement: { update: jest.fn() },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.refundOrder({ orderId: ids.order, reason: 'late refund' })).resolves.toMatchObject({ entitlementIds: [] });
    expect(tx.installationEntitlement.update).not.toHaveBeenCalled();
  });

  it('marks entitlements revoked instead of refunded when a dispute forces the reversal', async () => {
    const tx = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(paidOrder()), update: jest.fn().mockResolvedValue({}) },
      marketplaceRefund: { create: jest.fn().mockResolvedValue({ id: 'refund-1' }) },
      marketplacePayment: { update: jest.fn().mockResolvedValue({}) },
      installationEntitlement: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await service.reverseOrder(tx as any, { orderId: ids.order, reason: 'chargeback: dispute-1', initiatedBy: 'dispute' });
    expect(tx.installationEntitlement.update.mock.calls[0][0].data.status).toBe('REVOKED');
  });

  it('revokes an active entitlement for cause', async () => {
    const entitlementId = '00000000-0000-4000-8000-000000000005';
    const tx = {
      installationEntitlement: {
        findUnique: jest.fn().mockResolvedValue({ id: entitlementId, status: 'ACTIVE' }),
        update: jest.fn().mockResolvedValue({ id: entitlementId, status: 'REVOKED' }),
      },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.revokeEntitlement({ entitlementId, reason: 'policy violation' }))
      .resolves.toEqual({ entitlementId, status: 'REVOKED' });
    expect(tx.installationEntitlement.update.mock.calls[0][0].data).toMatchObject({ status: 'REVOKED', revokedReason: 'policy violation' });
  });

  it('refuses to revoke an entitlement that already reached a terminal state', async () => {
    const entitlementId = '00000000-0000-4000-8000-000000000005';
    const tx = { installationEntitlement: { findUnique: jest.fn().mockResolvedValue({ id: entitlementId, status: 'REFUNDED' }) } };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.revokeEntitlement({ entitlementId, reason: 'duplicate revoke' })).rejects.toThrow('cannot be revoked from REFUNDED');
  });

  it('expires only active entitlements whose license window has passed', async () => {
    const prisma = { installationEntitlement: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) } } as any;
    const service = new CommerceService(prisma, config());
    const now = new Date('2027-01-01Z');
    await expect(service.expireOverdueEntitlements(now)).resolves.toEqual({ expiredCount: 3 });
    expect(prisma.installationEntitlement.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', expiresAt: { lt: now } }, data: { status: 'EXPIRED' },
    });
  });
});
