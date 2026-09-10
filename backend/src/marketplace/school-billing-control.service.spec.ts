import { SchoolBillingControlService } from './school-billing-control.service';

jest.mock('./marketplace-identity-config', () => ({
  readMarketplaceIdentityConfig: () => ({ marketplaceUrl: 'https://marketplace.example', requestTimeoutMs: 5000 }),
}));

describe('SchoolBillingControlService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stores the customer-safe billing snapshot and notifies every administrator once', async () => {
    const previous = { access: 'ACTIVE', warningsJson: '[]' };
    const tx = {
      marketplaceSchoolControl: { findUnique: jest.fn().mockResolvedValue(previous), upsert: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]) },
      notification: { createMany: jest.fn() },
    };
    const prisma = {
      installation: { findUnique: jest.fn().mockResolvedValue({ installationId: 'installation-1' }) },
      $transaction: jest.fn((work: any) => work(tx)),
    } as any;
    const keys = { sign: jest.fn().mockResolvedValue('signature') } as any;
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({
      access: 'ACTIVE', reason: null,
      warnings: [{ invoiceId: 'invoice-1', invoiceNumber: 'WTN-1', currency: 'USD', outstandingMinor: 1000, dueAt: '2026-09-01T00:00:00.000Z', suspendAt: '2026-09-13T00:00:00.000Z', final: true }],
      billing: { schoolName: 'Bora School', outstandingMinor: 1000, invoices: [{ id: 'invoice-1' }], notifications: [] },
    }) } as any);

    await expect(new SchoolBillingControlService(prisma, keys).sync(new Date('2026-09-10T00:00:00.000Z'))).resolves.toEqual({ configured: true, access: 'ACTIVE', warnings: 1 });
    expect(tx.marketplaceSchoolControl.upsert.mock.calls[0][0].update.billingJson).toContain('Bora School');
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ userId: 'admin-1', type: 'platform_billing_final_notice' })]) });
  });

  it('retains the last verified state when the marketplace is unavailable', async () => {
    const prisma = {
      installation: { findUnique: jest.fn().mockResolvedValue({ installationId: 'installation-1' }) },
      marketplaceSchoolControl: { upsert: jest.fn() },
    } as any;
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network unavailable'));
    await expect(new SchoolBillingControlService(prisma, { sign: jest.fn().mockResolvedValue('signature') } as any).sync()).resolves.toEqual({ configured: true, unavailable: true });
    expect(prisma.marketplaceSchoolControl.upsert.mock.calls[0][0].update).not.toHaveProperty('access');
  });
});
