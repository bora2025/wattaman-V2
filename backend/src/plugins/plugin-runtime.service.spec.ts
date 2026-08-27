import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { PluginEventBus } from './plugin-events';
import { PluginRuntimeService } from './plugin-runtime.service';

describe('PluginRuntimeService', () => {
  const originalEnvironment = process.env;
  let directory: string;
  const dependencies = () => [
    { registerRoute: jest.fn(), registerPermissions: jest.fn(), registerNavigation: jest.fn(), clear: jest.fn() },
    { register: jest.fn(), clear: jest.fn() },
    { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
    { readText: jest.fn(), writeText: jest.fn(), delete: jest.fn(), list: jest.fn() },
  ] as const;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wattanam-runtime-test-'));
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/test',
      APP_VERSION: '0.1.0',
      PLUGIN_DIR: directory,
      PLUGIN_TRUSTED_KEYS: '{}',
    };
  });

  afterEach(async () => {
    process.env = originalEnvironment;
    await fs.rm(directory, { recursive: true, force: true });
    delete (global as any).__wattanamPluginActivated;
    delete (global as any).__wattanamPluginCleaned;
  });

  it('loads an authenticated backend lifecycle entry and unloads its cleanup', async () => {
    const installedPath = path.join(directory, 'wattanam.test', '1.0.0');
    await fs.mkdir(path.join(installedPath, 'backend'), { recursive: true });
    await fs.writeFile(path.join(installedPath, 'backend', 'index.js'), `
      module.exports = {
        id: 'wattanam.test',
        activate(context) {
          global.__wattanamPluginActivated = context.pluginId;
          return () => { global.__wattanamPluginCleaned = true; };
        }
      };
    `);
    const manifest = {
      id: 'wattanam.test', version: '1.0.0', backendEntry: 'backend/index.js',
      capabilities: [], permissions: [], dependencies: {},
    };
    const prisma = {
      pluginInstallation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wattanam.test', version: '1.0.0', installedPath }),
      },
    } as any;
    const verifier = { verifyInstalledDirectory: jest.fn().mockResolvedValue({ manifest }) } as any;
    const [extensions, jobs, settings, storage] = dependencies();
    const runtime = new PluginRuntimeService(prisma, verifier, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any);

    await runtime.load('wattanam.test');
    expect((global as any).__wattanamPluginActivated).toBe('wattanam.test');
    await runtime.unload('wattanam.test');
    expect((global as any).__wattanamPluginCleaned).toBe(true);
  });

  it('rejects a registry path outside the configured plugin directory', async () => {
    const prisma = { pluginInstallation: { findUnique: jest.fn().mockResolvedValue({ id: 'wattanam.test', installedPath: os.tmpdir() }) } } as any;
    const [extensions, jobs, settings, storage] = dependencies();
    const runtime = new PluginRuntimeService(prisma, {} as any, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any);
    await expect(runtime.load('wattanam.test')).rejects.toThrow('outside PLUGIN_DIR');
  });
});
