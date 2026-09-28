import { generateKeyPairSync } from 'node:crypto';
import { CommerceService } from './commerce.service';

const ids = {
  account: '00000000-0000-4000-8000-000000000001', installation: '00000000-0000-4000-8000-000000000002',
  price: '00000000-0000-4000-8000-000000000003', order: '00000000-0000-4000-8000-000000000004',
};

const configFor = () => config();

function config() {
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { publicBaseUrl: 'https://marketplace.example', entitlementPrivateKey: key, entitlementKeyId: 'entitlement-1' } as any;
}

function prismaWith(tx: any) {
  if (tx.installationEntitlement && !tx.installationEntitlement.findUnique) {
    tx.installationEntitlement.findUnique = jest.fn().mockResolvedValue(null);
  }
  return { $transaction: jest.fn((work: (value: any) => unknown) => work(tx)) } as any;
}

describe('marketplace commerce invariants', () => {
  it('creates an idempotent order using only the active server price', async () => {
    const created = { id: ids.order, totalMinor: 2500, lines: [{ unitPriceMinor: 2500 }] };
    const tx = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: ids.account }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: ids.installation, accountId: ids.account }) },
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

  it('refuses to order against an installation registered to another account', async () => {
    const tx = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: ids.account }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: ids.installation, accountId: 'another-account' }) },
      productPrice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CommerceService(prismaWith(tx), config());
    await expect(service.createOrder({
      accountId: ids.account, installationId: ids.installation, currency: 'USD', priceIds: [ids.price], idempotencyKey: 'checkout-request-0002',
    }, new Date('2026-08-28Z'))).rejects.toThrow('not registered to this account');
  });

  it('commits payment, entitlement, and paid order in the same transaction', async () => {
    const line = {
      id: 'line-1', pluginId: 'official.attendance', unitPriceMinor: 2500, entitlement: null,
      price: { amountMinor: 2500, licensedMajor: 1, licenseDays: 365, updatesDays: 180 },
      plugin: { publisherId: 'publisher-1' },
    };
    const tx = {
      marketplacePayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: ids.order, status: 'SUCCEEDED', amountMinor: 2500 }) },
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: ids.order, accountId: ids.account, installationId: ids.installation, status: 'PENDING', totalMinor: 2500, account: {}, installation: { installationId: 'school-public-id' }, lines: [line] }),
        update: jest.fn().mockResolvedValue({}),
      },
      installationEntitlement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({ id: 'entitlement-1' }) },
      publisherRevenueEntry: { upsert: jest.fn().mockResolvedValue({ id: 'revenue-1' }) },
      schoolPluginRequest: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      platformAuditEvent: { create: jest.fn() },
    };
    const service = new CommerceService(prismaWith(tx), config());
    const result = await service.settleManualPayment({ orderId: ids.order, providerReference: 'invoice-2026-001' }, new Date('2026-08-28Z'));
    expect(result).toEqual({ orderId: ids.order, status: 'PAID', paymentId: 'payment-1', entitlementIds: ['entitlement-1'] });
    const token = tx.installationEntitlement.upsert.mock.calls[0][0].create.signedToken;
    expect(token.payload).toMatchObject({ generation: 1, status: 'ACTIVE', installationId: 'school-public-id', productId: 'official.attendance', licensedMajorRange: '^1.0.0' });
    expect(tx.marketplaceOrder.update).toHaveBeenCalledWith({ where: { id: ids.order }, data: { status: 'PAID' } });
  });

  it('closes a linked purchase-assistance request only after verified payment issues its entitlement', async () => {
    const line = {
      id: 'line-1', pluginId: 'official.attendance', unitPriceMinor: 2500, entitlement: null,
      price: { amountMinor: 2500, licensedMajor: 1, licenseDays: 365, updatesDays: 180 },
      plugin: { publisherId: 'publisher-1' },
    };
    const tx = {
      marketplacePayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: ids.order, status: 'SUCCEEDED', amountMinor: 2500 }) },
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: ids.order, accountId: ids.account, installationId: ids.installation, status: 'PENDING', totalMinor: 2500, account: {}, installation: { installationId: 'school-public-id' }, lines: [line] }),
        update: jest.fn().mockResolvedValue({}),
      },
      installationEntitlement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({ id: 'entitlement-1' }) },
      publisherRevenueEntry: { upsert: jest.fn().mockResolvedValue({ id: 'revenue-1' }) },
      schoolPluginRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-1', status: 'APPROVED' }),
        update: jest.fn().mockResolvedValue({}),
      },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    await new CommerceService(prismaWith(tx), config()).settleManualPayment({ orderId: ids.order, providerReference: 'invoice-request-1' }, new Date('2026-09-02Z'));
    expect(tx.schoolPluginRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' }, data: { status: 'ENTITLEMENT_ISSUED', entitlementId: 'entitlement-1', fulfilledAt: new Date('2026-09-02Z') },
    });
    expect(tx.platformAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'school_plugin_request_entitlement_issued_after_payment' }) });
  });

  it('does not record payment when immutable line totals disagree', async () => {
    const tx = {
      marketplacePayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue({
        id: ids.order, accountId: ids.account, installationId: ids.installation, status: 'PENDING', totalMinor: 2600,
        account: {}, installation: { installationId: 'school-public-id' }, lines: [{ id: 'line-1', pluginId: 'official.attendance', unitPriceMinor: 2500, entitlement: null, price: { amountMinor: 2500 }, plugin: { publisherId: 'publisher-1' } }],
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
      installationEntitlement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      publisherRevenueEntry: { upsert: jest.fn() },
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
  function activeToken(generation = 1) {
    return { payload: {
      schemaVersion: 1, generation, status: 'ACTIVE', tokenId: '00000000-0000-4000-8000-000000000010',
      installationId: 'school-public-id', customerId: ids.account, productId: 'official.attendance', licensedMajorRange: '^1.0.0',
      issuedAt: '2026-01-01T00:00:00.000Z', notBefore: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z',
      updatesThrough: '2026-12-01T00:00:00.000Z', offlineRecheckAfter: '2026-10-01T00:00:00.000Z', features: [],
      issuer: 'https://marketplace.example', audience: 'wattanam-school', keyId: 'entitlement-1', nonce: 'a'.repeat(32),
    }, signature: { algorithm: 'ed25519', keyId: 'entitlement-1', value: 'unused' } };
  }

  function paidOrder(overrides: Partial<{ status: string; entitlementStatus: string; paymentStatus: string; refunds: unknown[] }> = {}) {
    return {
      id: ids.order, status: overrides.status ?? 'PAID', refunds: overrides.refunds ?? [],
      payments: [{ id: 'payment-1', status: overrides.paymentStatus ?? 'SUCCEEDED', amountMinor: 2500 }],
      lines: [{ id: 'line-1', entitlement: { id: 'entitlement-1', status: overrides.entitlementStatus ?? 'ACTIVE', signedToken: activeToken() } }],
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
    expect(tx.installationEntitlement.update).toHaveBeenCalledWith({ where: { id: 'entitlement-1' }, data: expect.objectContaining({
      status: 'REFUNDED', generation: 2, revokedAt: now, revokedReason: 'customer requested cancellation', signedToken: expect.objectContaining({ payload: expect.objectContaining({ status: 'REFUNDED', generation: 2 }) }),
    }) });
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
        findUnique: jest.fn().mockResolvedValue({ id: entitlementId, status: 'ACTIVE', signedToken: activeToken() }),
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
    const overdue = [1, 2, 3].map((number) => ({ id: `entitlement-${number}`, status: 'ACTIVE', signedToken: activeToken(number) }));
    const prisma = { installationEntitlement: { findMany: jest.fn().mockResolvedValue(overdue), update: jest.fn().mockResolvedValue({}) } } as any;
    const service = new CommerceService(prisma, config());
    const now = new Date('2027-01-01Z');
    await expect(service.expireOverdueEntitlements(now)).resolves.toEqual({ expiredCount: 3 });
    expect(prisma.installationEntitlement.findMany).toHaveBeenCalledWith({ where: { status: 'ACTIVE', expiresAt: { lt: now } } });
    expect(prisma.installationEntitlement.update).toHaveBeenCalledTimes(3);
    expect(prisma.installationEntitlement.update.mock.calls[0][0].data).toMatchObject({ status: 'EXPIRED', generation: 2 });
  });
});

/**
 * Buying on the school's account. The entitlement is granted at approval rather than at payment,
 * which is credit -- see docs/decisions/school-invoice-plugin-credit-2026-09-10.md. Everything in
 * this block is one of the bounds that decision put on it.
 */
describe('CommerceService invoice settlement', () => {
  const ACCOUNT = '11111111-1111-4111-8111-111111111111';
  const INSTALLATION = '22222222-2222-4222-8222-222222222222';
  const PRICE = '33333333-3333-4333-8333-333333333333';
  const config = configFor();

  const activeSchool = { id: 'school-1', status: 'ACTIVE', currency: 'USD', billingAnchorAt: new Date('2026-01-15T00:00:00.000Z'), billingPlan: { id: 'plan-1', active: true, currency: 'USD' } };

  function harness(school: unknown = activeSchool) {
    const created = { id: 'order-1', lines: [{ id: 'order-line-1' }] };
    const tx = {
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'order-1', accountId: ACCOUNT, installationId: INSTALLATION,
          installation: { installationId: 'install-abc' },
          lines: [{ id: 'order-line-1', pluginId: 'plugin-1', price: { licenseDays: 3650, updatesDays: 365, licensedMajor: 1 }, entitlement: null }],
        }),
      },
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: ACCOUNT }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: INSTALLATION, installationId: 'install-abc', accountId: ACCOUNT, school }) },
      productPrice: { findMany: jest.fn().mockResolvedValue([{ id: PRICE, pluginId: 'plugin-1', currency: 'USD', amountMinor: 12000, licensedMajor: 1, licenseDays: 3650, updatesDays: 365, validFrom: new Date('2020-01-01'), validUntil: null, plugin: { id: 'plugin-1', isPaid: true, status: 'APPROVED' } }]) },
      installationEntitlement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({ id: 'entitlement-1' }) },
      publisherRevenueEntry: { upsert: jest.fn().mockResolvedValue({ id: 'revenue-1' }) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    return { tx, prisma };
  }

  const order = (settlementMode: string) => ({
    accountId: ACCOUNT, installationId: INSTALLATION, currency: 'USD', priceIds: [PRICE],
    idempotencyKey: 'order-idempotency-00001', settlementMode,
  });

  it('grants the entitlement at approval when a school buys on account', async () => {
    const { tx, prisma } = harness();
    await new CommerceService(prisma, config).createOrder(order('INVOICE'), new Date('2026-09-10T00:00:00.000Z'));

    expect(tx.marketplaceOrder.create.mock.calls[0][0].data.settlementMode).toBe('INVOICE');
    expect(tx.installationEntitlement.upsert).toHaveBeenCalled();
  });

  // No money has arrived; settlementMode is what distinguishes "not paid yet" from "not paid, and
  // that is the arrangement".
  it('leaves the order pending, because nothing has been paid', async () => {
    const { tx, prisma } = harness();
    await new CommerceService(prisma, config).createOrder(order('INVOICE'), new Date('2026-09-10T00:00:00.000Z'));

    expect(tx.marketplaceOrder.create.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('still withholds the entitlement on an immediate order', async () => {
    const { tx, prisma } = harness();
    await new CommerceService(prisma, config).createOrder(order('IMMEDIATE'), new Date('2026-09-10T00:00:00.000Z'));

    expect(tx.installationEntitlement.upsert).not.toHaveBeenCalled();
  });

  it('defaults to immediate settlement, so existing callers are unchanged', async () => {
    const { tx, prisma } = harness();
    const { settlementMode: _omitted, ...withoutMode } = order('IMMEDIATE');
    await new CommerceService(prisma, config).createOrder(withoutMode, new Date('2026-09-10T00:00:00.000Z'));

    expect(tx.marketplaceOrder.create.mock.calls[0][0].data.settlementMode).toBe('IMMEDIATE');
    expect(tx.installationEntitlement.upsert).not.toHaveBeenCalled();
  });

  it('refuses credit to a school with no active billing plan', async () => {
    const { prisma } = harness({ ...activeSchool, billingPlan: null });
    await expect(new CommerceService(prisma, config).createOrder(order('INVOICE')))
      .rejects.toThrow(/no active billing plan/);
  });

  // Without an anniversary the recurring run never raises an invoice, so there is nothing to bill.
  it('refuses credit to a school with no billing anniversary', async () => {
    const { prisma } = harness({ ...activeSchool, billingAnchorAt: null });
    await expect(new CommerceService(prisma, config).createOrder(order('INVOICE')))
      .rejects.toThrow(/no billing anniversary/);
  });

  // An exchange rate on an invoice has tax consequences nobody has decided. Refuse, do not convert.
  it('refuses a price in a currency the school is not billed in', async () => {
    const { prisma } = harness({ ...activeSchool, currency: 'KHR', billingPlan: { id: 'plan-1', active: true, currency: 'KHR' } });
    await expect(new CommerceService(prisma, config).createOrder(order('INVOICE')))
      .rejects.toThrow(/billed in KHR and the price is in USD/);
  });

  it('refuses credit to an installation with no customer school', async () => {
    const { prisma } = harness(null);
    await expect(new CommerceService(prisma, config).createOrder(order('INVOICE')))
      .rejects.toThrow(/not linked to a customer school/);
  });
});

/**
 * The publisher's share, recorded with the money.
 *
 * recordOrderRevenue existed but nothing called it: an operator had to hit an admin endpoint per
 * order, so a third party's earnings depended on somebody remembering. Both settlement paths now
 * write the entry in the same transaction that marks the order paid.
 */
describe('CommerceService publisher revenue', () => {
  const ACCOUNT = '11111111-1111-4111-8111-111111111111';
  const ORDER = '44444444-4444-4444-8444-444444444444';

  function harness() {
    const line = {
      id: 'order-line-1', pluginId: 'plugin-1', unitPriceMinor: 10000, entitlement: null,
      price: { amountMinor: 10000, licensedMajor: 1, licenseDays: 3650, updatesDays: 365 },
      plugin: { publisherId: 'publisher-1' },
    };
    const tx = {
      marketplacePayment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'payment-1', orderId: ORDER, status: 'SUCCEEDED', amountMinor: 10000 }) },
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: ORDER, accountId: ACCOUNT, installationId: 'registration-1', status: 'PENDING', currency: 'USD', totalMinor: 10000, account: {}, installation: { installationId: 'install-abc' }, lines: [line] }),
        update: jest.fn().mockResolvedValue({}),
      },
      installationEntitlement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({ id: 'entitlement-1' }) },
      publisherRevenueEntry: { upsert: jest.fn().mockResolvedValue({ id: 'revenue-1' }) },
      schoolPluginRequest: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    return { tx, prisma };
  }

  it('records the publisher share when a payment settles an order', async () => {
    const { tx, prisma } = harness();
    await new CommerceService(prisma, config()).settleManualPayment({ orderId: ORDER, providerReference: 'bank-ref-1' });

    const entry = tx.publisherRevenueEntry.upsert.mock.calls[0][0];
    expect(entry.create).toMatchObject({ publisherId: 'publisher-1', orderLineId: 'order-line-1', type: 'SALE', currency: 'USD', grossMinor: 10000 });
  });

  // 15% of 10000 minor units, the same rate the manual endpoint has always defaulted to.
  it('takes the platform fee out of the publisher net', async () => {
    const { tx, prisma } = harness();
    await new CommerceService(prisma, config()).settleManualPayment({ orderId: ORDER, providerReference: 'bank-ref-2' });

    expect(tx.publisherRevenueEntry.upsert.mock.calls[0][0].create).toMatchObject({ feeMinor: 1500, netMinor: 8500 });
  });

  // The unique index behind this upsert is what stops a retried webhook paying a publisher twice.
  it('writes the entry as an upsert keyed on the order line, so a retry cannot double-pay', async () => {
    const { tx, prisma } = harness();
    await new CommerceService(prisma, config()).settleManualPayment({ orderId: ORDER, providerReference: 'bank-ref-3' });

    expect(tx.publisherRevenueEntry.upsert.mock.calls[0][0]).toMatchObject({
      where: { orderLineId_type: { orderLineId: 'order-line-1', type: 'SALE' } },
      update: {},
    });
  });
});
