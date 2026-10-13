import { PluginPricingService } from './plugin-pricing.service';

function fixture(isPaid = false) {
  const tx = {
    marketplacePlugin: {
      findUnique: jest.fn()
        .mockResolvedValueOnce({ id: 'plugin.one', name: 'Plugin One', isPaid })
        .mockResolvedValue({ id: 'plugin.one', name: 'Plugin One', isPaid: true, prices: [] }),
      update: jest.fn().mockResolvedValue({}),
    },
    productPrice: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'price-1', ...data })),
    },
    platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
  return { service: new PluginPricingService(prisma as never), tx };
}

const context = { correlationId: 'correlation-123', ip: '127.0.0.1', userAgent: 'jest' };

describe('PluginPricingService', () => {
  it('publishes a paid offer without mutating historical prices', async () => {
    const { service, tx } = fixture(false);
    await service.configure('plugin.one', 'operator-1', {
      mode: 'PAID', currency: 'usd', amountMinor: 4900, licensedMajor: 1,
      licenseDays: 365, updatesDays: 180, internalReason: 'Initial commercial release',
    }, context);

    expect(tx.productPrice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ pluginId: 'plugin.one', currency: 'USD' }),
    }));
    expect(tx.productPrice.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      pluginId: 'plugin.one', currency: 'USD', amountMinor: 4900,
    }) });
    expect(tx.marketplacePlugin.update).toHaveBeenCalledWith({ where: { id: 'plugin.one' }, data: { isPaid: true } });
    expect(tx.platformAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'plugin_pricing_configured', operatorId: 'operator-1', reason: 'Initial commercial release',
    }) });
  });

  it('converts a plugin to free and closes every active offer', async () => {
    const { service, tx } = fixture(true);
    await service.configure('plugin.one', 'operator-1', { mode: 'FREE', internalReason: 'Community edition' }, context);

    expect(tx.productPrice.updateMany).toHaveBeenCalledWith({
      where: { pluginId: 'plugin.one', OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }] },
      data: { validUntil: expect.any(Date) },
    });
    expect(tx.productPrice.create).not.toHaveBeenCalled();
    expect(tx.marketplacePlugin.update).toHaveBeenCalledWith({ where: { id: 'plugin.one' }, data: { isPaid: false } });
  });

  it('rejects update access longer than the licence', async () => {
    const { service } = fixture();
    await expect(service.configure('plugin.one', 'operator-1', {
      mode: 'PAID', currency: 'USD', amountMinor: 100, licensedMajor: 1,
      licenseDays: 30, updatesDays: 31, internalReason: 'Invalid window',
    }, context)).rejects.toThrow('Updates duration cannot exceed the licence duration');
  });
});
