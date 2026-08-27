import { PluginJobsService } from './plugin-jobs.service';

describe('PluginJobsService', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original, NODE_ENV: 'test' }; });
  afterEach(() => { process.env = original; });

  it('persists definition and successful run state without overlapping', async () => {
    const prisma = {
      pluginJobDefinition: { upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      pluginJobRun: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), update: jest.fn() },
      $transaction: jest.fn(async (values) => Promise.all(values)),
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
    const prisma = {
      pluginJobDefinition: { update: jest.fn() },
      pluginJobRun: { create: jest.fn().mockResolvedValue({ id: 'run-2' }), update: jest.fn() },
      $transaction: jest.fn(async (values) => Promise.all(values)),
    } as any;
    const service = new PluginJobsService(prisma);
    await service.run('wattanam.test', 'broken', async () => { throw new Error('expected failure'); });
    expect(prisma.pluginJobRun.update).toHaveBeenCalledWith({ where: { id: 'run-2' }, data: expect.objectContaining({ status: 'failed', error: 'expected failure' }) });
  });
});
