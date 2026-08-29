import { PluginJobsService } from './plugin-jobs.service';

describe('PluginJobsService', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original, NODE_ENV: 'test' }; });
  afterEach(() => { process.env = original; });

  it('persists definition and successful run state without overlapping', async () => {
    const tx = {
      pluginJobDefinition: { upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      pluginJobRun: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), update: jest.fn() },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: true }]),
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (work) => work(tx)),
    } as any;
    const service = new PluginJobsService(prisma);
    const handler = jest.fn(async () => undefined);
    const dispose = await service.register('wattanam.test', { id: 'digest', intervalSeconds: 60, handler });
    await service.run('wattanam.test', 'digest', handler);
    expect(prisma.pluginJobRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ pluginId: 'wattanam.test', jobId: 'digest', status: 'running' }) });
    expect(prisma.pluginJobRun.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: expect.objectContaining({ status: 'completed' }) });
    dispose();
    await service.clear('wattanam.test');
  });

  it('isolates and records handler failures', async () => {
    const tx = {
      pluginJobDefinition: { update: jest.fn() },
      pluginJobRun: { create: jest.fn().mockResolvedValue({ id: 'run-2' }), update: jest.fn() },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: true }]),
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (work) => work(tx)),
    } as any;
    const service = new PluginJobsService(prisma);
    await service.run('wattanam.test', 'broken', async () => { throw new Error('expected failure'); });
    expect(prisma.pluginJobRun.update).toHaveBeenCalledWith({ where: { id: 'run-2' }, data: expect.objectContaining({ status: 'failed', error: 'expected failure' }) });
  });

  it('uses a transaction-scoped advisory lock so another worker skips the same job', async () => {
    const handler = jest.fn();
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: false }]) };
    const prisma = { $transaction: jest.fn(async (work) => work(tx)) } as any;
    const service = new PluginJobsService(prisma);
    await service.run('wattanam.test', 'singleton', handler);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'), 'wattanam.test', 'singleton');
    expect(handler).not.toHaveBeenCalled();
  });

  it('persists plugin job definitions but starts no timer in an API-only process', async () => {
    process.env.PROCESS_ROLE = 'api';
    const interval = jest.spyOn(global, 'setInterval');
    const prisma = { pluginJobDefinition: { upsert: jest.fn(), updateMany: jest.fn() } } as any;
    const service = new PluginJobsService(prisma);
    const dispose = await service.register('wattanam.test', { id: 'api-disabled-job', intervalSeconds: 60, handler: jest.fn() });
    expect(prisma.pluginJobDefinition.upsert).toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    await expect(service.register('wattanam.test', { id: 'api-disabled-job', intervalSeconds: 60, handler: jest.fn() })).rejects.toThrow('already registered');
    dispose();
    interval.mockRestore();
  });
});
