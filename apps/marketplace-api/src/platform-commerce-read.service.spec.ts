import { PlatformCommerceReadService } from './platform-commerce-read.service';

describe('PlatformCommerceReadService', () => {
  it('never selects signed entitlement tokens for an operator list', async () => {
    const prisma = { installationEntitlement: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await new PlatformCommerceReadService(prisma).entitlements({ status: 'ACTIVE' });
    const query = prisma.installationEntitlement.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: 'ACTIVE' });
    expect(query.select).toHaveProperty('tokenId', true);
    expect(query.select).not.toHaveProperty('signedToken');
  });

  it('keeps financial values in integer minor units', async () => {
    const row = {
      id: 'order-1', status: 'PAID', currency: 'USD', totalMinor: 1234,
      account: { id: 'account-1', displayName: 'Customer', email: 'customer@example.com' },
      installation: { id: 'registration-1', installationId: 'school-1', label: 'School' },
      _count: { lines: 1, payments: 1, refunds: 0 },
    };
    const prisma = { marketplaceOrder: { findMany: jest.fn().mockResolvedValue([row]) } } as any;
    const result = await new PlatformCommerceReadService(prisma).orders({ currency: 'USD' });
    expect(result.items[0].totalMinor).toBe(1234);
    expect(result.items[0].account.email).toBe('c*******@example.com');
  });

  it('reports marketplace health without querying school databases', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      marketplaceOrder: { count }, marketplacePayment: { count }, marketplacePaymentDispute: { count },
      installationEntitlement: { count }, installationRegistration: { count }, paymentWebhookEvent: { count }, pluginVersion: { count },
    } as any;
    const result = await new PlatformCommerceReadService(prisma).operationsHealth();
    expect(result.database).toBe('ok');
    expect(Object.values(result.attention).every(value => value === 0)).toBe(true);
  });
});
