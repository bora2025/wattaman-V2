import { PlatformDirectoryService } from './platform-directory.service';

describe('PlatformDirectoryService', () => {
  it('masks customer emails and excludes credential material in the query', async () => {
    const prisma = { marketplaceAccount: { findMany: jest.fn().mockResolvedValue([{
      id: 'account-1', displayName: 'Customer', email: 'customer@example.com',
      emailVerifiedAt: null, mfaEnabled: false, lockedUntil: null, createdAt: new Date(),
      _count: { installations: 1, orders: 0 },
    }]) } } as any;
    const result = await new PlatformDirectoryService(prisma).customers({ limit: '25' });
    expect(result.items[0].email).toBe('c*******@example.com');
    const select = prisma.marketplaceAccount.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('mfaSecret');
    expect(select).not.toHaveProperty('sessions');
  });

  it('returns only marketplace-owned school registration metadata', async () => {
    const prisma = { installationRegistration: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await new PlatformDirectoryService(prisma).installations({ linked: 'true' });
    const query = prisma.installationRegistration.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ grant: { is: { revokedAt: null } } });
    expect(query.select).toHaveProperty('installationId', true);
    expect(query.select).not.toHaveProperty('students');
    expect(query.select).not.toHaveProperty('databaseUrl');
  });

  it('returns 404 instead of an empty detail for an unknown plugin', async () => {
    const prisma = { marketplacePlugin: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    await expect(new PlatformDirectoryService(prisma).plugin('missing.plugin')).rejects.toMatchObject({ status: 404 });
  });
});
