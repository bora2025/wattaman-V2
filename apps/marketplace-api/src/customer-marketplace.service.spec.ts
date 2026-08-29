import { CustomerMarketplaceService } from './customer-marketplace.service';

const ids = {
  account: '00000000-0000-4000-8000-000000000001', registration: '00000000-0000-4000-8000-000000000002',
  publicInstallation: '00000000-0000-4000-8000-000000000003', price: '00000000-0000-4000-8000-000000000004',
};

describe('CustomerMarketplaceService', () => {
  it('shows public product details while filtering versions by core compatibility', async () => {
    const prisma: any = { marketplacePlugin: { findMany: jest.fn().mockResolvedValue([{
      id: 'official.attendance', name: 'Attendance', description: 'Attendance tools', license: 'Proprietary', isPaid: true,
      publisher: { slug: 'wattanam', displayName: 'Wattanam Official' },
      prices: [{ id: ids.price, currency: 'USD', amountMinor: 2500, licensedMajor: 1, updatesDays: 365, licenseDays: 3650 }],
      versions: [
        { version: '1.1.0', requiresCore: '^1.0.0', changelog: 'Current', publishedAt: new Date(), artifact: { sha256: 'a'.repeat(64), sizeBytes: 100 } },
        { version: '2.0.0', requiresCore: '^2.0.0', changelog: 'Future', publishedAt: new Date(), artifact: { sha256: 'b'.repeat(64), sizeBytes: 100 } },
      ], entitlements: [],
    }]) } };
    const result = await new CustomerMarketplaceService(prisma, {} as any).catalog('1.4.0');
    expect(result[0]).toMatchObject({ id: 'official.attendance', paid: true, compatible: true, ownership: undefined });
    expect(result[0].versions.map((item) => item.version)).toEqual(['1.1.0']);
  });

  it('derives checkout ownership from the authenticated account', async () => {
    const commerce: any = { createOrder: jest.fn().mockResolvedValue({ id: 'order-1' }) };
    const prisma: any = { installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: ids.registration, accountId: ids.account }) } };
    const service = new CustomerMarketplaceService(prisma, commerce);
    await service.checkout(ids.account, { installationId: ids.publicInstallation, currency: 'USD', priceIds: [ids.price], idempotencyKey: 'customer-checkout-0001' });
    expect(commerce.createOrder).toHaveBeenCalledWith({ accountId: ids.account, installationId: ids.registration, currency: 'USD', priceIds: [ids.price], idempotencyKey: 'customer-checkout-0001' });
  });

  it('rejects checkout for an installation owned by another account', async () => {
    const prisma: any = { installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: ids.registration, accountId: 'different-account' }) } };
    await expect(new CustomerMarketplaceService(prisma, {} as any).checkout(ids.account, { installationId: ids.publicInstallation, currency: 'USD', priceIds: [ids.price], idempotencyKey: 'customer-checkout-0002' })).rejects.toThrow('not registered to this account');
  });

  it('authorizes paid downloads only with active unexpired update access', async () => {
    const prisma: any = { installationEntitlement: { findFirst: jest.fn().mockResolvedValue({ installationId: ids.registration }) } };
    await expect(new CustomerMarketplaceService(prisma, {} as any).authorizeAccountDownload(ids.account, 'official.attendance', new Date('2026-08-29Z'))).resolves.toBe(ids.registration);
    expect(prisma.installationEntitlement.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ pluginId: 'official.attendance', status: 'ACTIVE', installation: { accountId: ids.account } }) });
  });

  it('denies a paid download without qualifying ownership', async () => {
    const prisma: any = { installationEntitlement: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new CustomerMarketplaceService(prisma, {} as any).authorizeAccountDownload(ids.account, 'official.attendance')).rejects.toThrow('active entitlement');
  });
});
