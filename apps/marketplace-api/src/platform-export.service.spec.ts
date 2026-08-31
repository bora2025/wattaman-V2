import { PlatformExportService } from './platform-export.service';

describe('PlatformExportService', () => {
  it('audits an export before returning a bounded, masked CSV', async () => {
    const prisma = {
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { findMany: jest.fn().mockResolvedValue([{
        id: '=formula', status: 'PAID', currency: 'USD', totalMinor: 2500,
        createdAt: new Date('2026-08-31T12:00:00.000Z'),
        account: { email: 'customer@example.com' },
        installation: { installationId: 'school-1', label: '+unsafe-label' },
      }]) },
    } as any;
    const service = new PlatformExportService(prisma);

    const result = await service.export(
      { resource: 'orders', limit: '10' },
      { operatorId: 'operator-1', context: { correlationId: 'corr-1', ip: '127.0.0.1', userAgent: 'jest' } },
    );

    expect(prisma.platformAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      operatorId: 'operator-1', action: 'platform_export', targetId: 'orders', correlationId: 'corr-1', success: true,
    }) });
    expect(prisma.marketplaceOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    expect(result.filename).toBe('orders.csv');
    expect(result.csv).toContain('c*******@example.com');
    expect(result.csv).toContain("\"'=formula\"");
    expect(result.csv).toContain("\"'+unsafe-label\"");
  });

  it('rejects an export larger than the fixed server cap', async () => {
    const prisma = { platformAuditEvent: { create: jest.fn() } } as any;
    const service = new PlatformExportService(prisma);
    await expect(service.export(
      { resource: 'orders', limit: '5001' },
      { operatorId: 'operator-1', context: { correlationId: 'corr-2' } },
    )).rejects.toThrow();
    expect(prisma.platformAuditEvent.create).not.toHaveBeenCalled();
  });
});
