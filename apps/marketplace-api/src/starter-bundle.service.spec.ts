import { StarterBundleService } from './starter-bundle.service';

const approvedPlugin = (overrides: Record<string, unknown> = {}) => ({
  id: 'wattanam.academic-management', name: 'Academic Management', status: 'APPROVED', isPaid: false,
  publisher: { slug: 'wattanam', displayName: 'Wattanam Official' },
  prices: [],
  versions: [{
    version: '1.2.0', requiresCore: '^1.0.0', reviewStatus: 'APPROVED', channel: 'STABLE',
    withdrawnAt: null, publishedAt: new Date('2026-09-20Z'), artifact: { sha256: 'a'.repeat(64) },
  }],
  ...overrides,
});

const bundle = (plugin = approvedPlugin()) => ({
  id: '10000000-0000-4000-8000-000000000001', slug: 'school-starter', name: 'School Starter',
  description: 'Academic and attendance foundations', status: 'DRAFT',
  items: [{ id: 'item-1', pluginId: plugin.id, versionRange: '^1.0.0', position: 0, required: true, plugin }],
});
const transactional = <T extends Record<string, any>>(prisma: T) => Object.assign(prisma, {
  $transaction: jest.fn((work: (tx: T) => unknown) => work(prisma)),
});

describe('StarterBundleService', () => {
  it('creates only bundles whose unique plugin ids exist', async () => {
    const prisma: any = transactional({
      marketplacePlugin: { findMany: jest.fn().mockResolvedValue([{ id: 'wattanam.academic-management' }]) },
      starterBundle: { create: jest.fn().mockResolvedValue({ id: 'bundle-1' }) },
    });
    await new StarterBundleService(prisma).create({
      slug: 'school-starter', name: 'School Starter', description: 'The recommended school foundation.',
      items: [{ pluginId: 'wattanam.academic-management', versionRange: '^1.0.0' }],
    });
    expect(prisma.starterBundle.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      items: { create: [{ pluginId: 'wattanam.academic-management', versionRange: '^1.0.0', required: true, position: 0 }] },
    }) }));
  });

  it('records the operator reason and request context atomically when creating a bundle', async () => {
    const prisma: any = transactional({
      marketplacePlugin: { findMany: jest.fn().mockResolvedValue([{ id: 'wattanam.academic-management' }]) },
      starterBundle: { create: jest.fn().mockResolvedValue({ id: 'bundle-1', slug: 'school-starter' }) },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    });
    await new StarterBundleService(prisma).create({
      slug: 'school-starter', name: 'School Starter', description: 'The recommended school foundation.',
      items: [{ pluginId: 'wattanam.academic-management', versionRange: '^1.0.0' }],
    }, {
      operatorId: 'operator-1', reason: 'Publish the supported school baseline',
      context: { correlationId: 'correlation-1', ip: '127.0.0.1', userAgent: 'jest' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.platformAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      operatorId: 'operator-1', action: 'starter_bundle_created', targetType: 'StarterBundle',
      targetId: 'bundle-1', reason: 'Publish the supported school baseline',
      correlationId: 'correlation-1', metadata: { slug: 'school-starter' },
    }) });
  });

  it('rejects duplicate plugin membership before writing', async () => {
    const prisma: any = transactional({ marketplacePlugin: { findMany: jest.fn() }, starterBundle: { create: jest.fn() } });
    await expect(new StarterBundleService(prisma).create({
      slug: 'bad', name: 'Bad', description: 'Duplicate membership is invalid.',
      items: [
        { pluginId: 'wattanam.academic-management', versionRange: '*' },
        { pluginId: 'wattanam.academic-management', versionRange: '^1.0.0' },
      ],
    })).rejects.toThrow('Duplicate bundle plugins');
    expect(prisma.starterBundle.create).not.toHaveBeenCalled();
  });

  it('publishes only when every member has an approved Stable signed artifact in range', async () => {
    const value = bundle();
    const prisma: any = transactional({
      starterBundle: {
        findUnique: jest.fn().mockResolvedValue(value),
        update: jest.fn().mockResolvedValue({ ...value, status: 'APPROVED' }),
      },
    });
    await expect(new StarterBundleService(prisma).publish(value.id)).resolves.toMatchObject({ status: 'APPROVED' });
    expect(prisma.starterBundle.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'APPROVED' } }));
  });

  it('refuses publication when a member has no matching installable artifact', async () => {
    const value = bundle(approvedPlugin({ versions: [{
      version: '2.0.0', requiresCore: '^1.0.0', reviewStatus: 'APPROVED', channel: 'STABLE',
      withdrawnAt: null, artifact: { sha256: 'a'.repeat(64) },
    }] }));
    const prisma: any = transactional({ starterBundle: { findUnique: jest.fn().mockResolvedValue(value), update: jest.fn() } });
    await expect(new StarterBundleService(prisma).publish(value.id)).rejects.toThrow('no approved Stable artifact');
    expect(prisma.starterBundle.update).not.toHaveBeenCalled();
  });

  it('returns compatible independent plugin plans with normal price ids', async () => {
    const plugin = approvedPlugin({ isPaid: true, prices: [{
      id: '20000000-0000-4000-8000-000000000001', currency: 'USD', amountMinor: 2500,
      validFrom: new Date('2026-01-01Z'), validUntil: null,
    }] });
    const prisma: any = { starterBundle: { findMany: jest.fn().mockResolvedValue([{ ...bundle(plugin), status: 'APPROVED' }]) } };
    const result = await new StarterBundleService(prisma).catalog('1.4.0', 'USD', new Date('2026-09-28Z'));
    expect(result[0].plugins[0]).toMatchObject({
      pluginId: 'wattanam.academic-management', version: '1.2.0', compatible: true, paid: true,
      price: { id: '20000000-0000-4000-8000-000000000001', currency: 'USD', amountMinor: 2500 },
    });
  });
});
