import { PlatformOperatorReadService } from './platform-operator-read.service';

describe('PlatformOperatorReadService', () => {
  it('returns safe operator inventory without credential fields', async () => {
    const row = { id: 'operator-1', email: 'owner@example.com', displayName: 'Owner', status: 'ACTIVE', mfaEnabled: true, roles: [], _count: { sessions: 1 } };
    const prisma = { platformOperator: { findMany: jest.fn().mockResolvedValue([row]) } } as any;
    const result = await new PlatformOperatorReadService(prisma).operators({ limit: '25' });
    expect(result.items).toEqual([row]);
    const select = prisma.platformOperator.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('mfaSecret');
    expect(select).not.toHaveProperty('mfaRecoveryCodes');
  });

  it('selects session metadata but never token hashes', async () => {
    const operator = { id: 'operator-1', sessions: [] };
    const prisma = { platformOperator: { findUnique: jest.fn().mockResolvedValue(operator) } } as any;
    await expect(new PlatformOperatorReadService(prisma).operator('operator-1')).resolves.toBe(operator);
    const sessionSelect = prisma.platformOperator.findUnique.mock.calls[0][0].select.sessions.select;
    expect(sessionSelect).toHaveProperty('id', true);
    expect(sessionSelect).not.toHaveProperty('tokenHash');
  });

  it('returns 404 for an unknown operator', async () => {
    const prisma = { platformOperator: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    await expect(new PlatformOperatorReadService(prisma).operator('missing')).rejects.toMatchObject({ status: 404 });
  });
});
