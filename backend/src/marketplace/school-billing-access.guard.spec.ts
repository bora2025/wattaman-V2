import { SchoolBillingAccessGuard } from './school-billing-access.guard';

function context(path: string) {
  return { switchToHttp: () => ({ getRequest: () => ({ path }) }) } as any;
}

describe('SchoolBillingAccessGuard', () => {
  it('blocks normal school APIs after verified billing suspension', async () => {
    const prisma = { marketplaceSchoolControl: { findUnique: jest.fn().mockResolvedValue({ access: 'SUSPENDED', reason: 'Invoice unpaid' }) } } as any;
    await expect(new SchoolBillingAccessGuard(prisma).canActivate(context('/classes'))).rejects.toMatchObject({ status: 402 });
  });

  it('keeps health, authentication, and billing recovery available during suspension', async () => {
    const prisma = { marketplaceSchoolControl: { findUnique: jest.fn() } } as any;
    const guard = new SchoolBillingAccessGuard(prisma);
    await expect(guard.canActivate(context('/health/ready'))).resolves.toBe(true);
    await expect(guard.canActivate(context('/auth/login'))).resolves.toBe(true);
    await expect(guard.canActivate(context('/auth/refresh'))).resolves.toBe(true);
    await expect(guard.canActivate(context('/admin/marketplace/billing-control/sync'))).resolves.toBe(true);
    expect(prisma.marketplaceSchoolControl.findUnique).not.toHaveBeenCalled();
  });
});
