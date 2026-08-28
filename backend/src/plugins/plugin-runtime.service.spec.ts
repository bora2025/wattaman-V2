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
    { sendEmail: jest.fn().mockResolvedValue({ sent: true }), sendSms: jest.fn().mockResolvedValue({ sent: true }) },
    { resolveAudience: jest.fn().mockResolvedValue([]) },
    { notifyUser: jest.fn() },
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
    const [extensions, jobs, settings, storage, notifications, directoryService, realtime] = dependencies();
    const runtime = new PluginRuntimeService(prisma, verifier, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any, notifications as any, directoryService as any, realtime as any);

    await runtime.load('wattanam.test');
    expect((global as any).__wattanamPluginActivated).toBe('wattanam.test');
    await runtime.unload('wattanam.test');
    expect((global as any).__wattanamPluginCleaned).toBe(true);
  });

  it('rejects a registry path outside the configured plugin directory', async () => {
    const prisma = { pluginInstallation: { findUnique: jest.fn().mockResolvedValue({ id: 'wattanam.test', installedPath: os.tmpdir() }) } } as any;
    const [extensions, jobs, settings, storage, notifications, directoryService, realtime] = dependencies();
    const runtime = new PluginRuntimeService(prisma, {} as any, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any, notifications as any, directoryService as any, realtime as any);
    await expect(runtime.load('wattanam.test')).rejects.toThrow('outside PLUGIN_DIR');
  });

  it('delegates a declared notifications.send capability to the core notification service', async () => {
    const installedPath = path.join(directory, 'wattanam.test', '1.0.0');
    await fs.mkdir(path.join(installedPath, 'backend'), { recursive: true });
    await fs.writeFile(path.join(installedPath, 'backend', 'index.js'), `
      module.exports = {
        id: 'wattanam.test',
        async activate(context) {
          global.__wattanamPluginNotified = await context.notifications.sendEmail('parent@example.com', 'Reminder', 'Body');
        }
      };
    `);
    const manifest = {
      id: 'wattanam.test', version: '1.0.0', backendEntry: 'backend/index.js',
      capabilities: ['notifications.send'], permissions: [], dependencies: {},
    };
    const prisma = { pluginInstallation: { findUnique: jest.fn().mockResolvedValue({ id: 'wattanam.test', version: '1.0.0', installedPath }) } } as any;
    const verifier = { verifyInstalledDirectory: jest.fn().mockResolvedValue({ manifest }) } as any;
    const [extensions, jobs, settings, storage, notifications, directoryService, realtime] = dependencies();
    const runtime = new PluginRuntimeService(prisma, verifier, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any, notifications as any, directoryService as any, realtime as any);

    await runtime.load('wattanam.test');
    expect(notifications.sendEmail).toHaveBeenCalledWith('parent@example.com', 'Reminder', 'Body');
    expect((global as any).__wattanamPluginNotified).toEqual({ sent: true });
    delete (global as any).__wattanamPluginNotified;
  });

  it('refuses to send a notification when the plugin did not declare notifications.send', async () => {
    const installedPath = path.join(directory, 'wattanam.test', '1.0.0');
    await fs.mkdir(path.join(installedPath, 'backend'), { recursive: true });
    await fs.writeFile(path.join(installedPath, 'backend', 'index.js'), `
      module.exports = {
        id: 'wattanam.test',
        activate(context) { return context.notifications.sendEmail('parent@example.com', 'Reminder', 'Body'); }
      };
    `);
    const manifest = { id: 'wattanam.test', version: '1.0.0', backendEntry: 'backend/index.js', capabilities: [], permissions: [], dependencies: {} };
    const prisma = { pluginInstallation: { findUnique: jest.fn().mockResolvedValue({ id: 'wattanam.test', version: '1.0.0', installedPath }) } } as any;
    const verifier = { verifyInstalledDirectory: jest.fn().mockResolvedValue({ manifest }) } as any;
    const [extensions, jobs, settings, storage, notifications, directoryService, realtime] = dependencies();
    const runtime = new PluginRuntimeService(prisma, verifier, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any, notifications as any, directoryService as any, realtime as any);
    await expect(runtime.load('wattanam.test')).rejects.toThrow('did not declare notifications.send');
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('delegates declared database, directory, and realtime capabilities, namespace-guarding raw SQL', async () => {
    const installedPath = path.join(directory, 'wattanam.test', '1.0.0');
    await fs.mkdir(path.join(installedPath, 'backend'), { recursive: true });
    await fs.writeFile(path.join(installedPath, 'backend', 'index.js'), `
      module.exports = {
        id: 'wattanam.test',
        async activate(context) {
          global.__wattanamPluginRows = await context.database.query('SELECT * FROM plugin_wattanam_test_notes WHERE id = $1', ['n1']);
          global.__wattanamPluginWrite = await context.database.execute('INSERT INTO plugin_wattanam_test_notes (id) VALUES ($1)', ['n1']);
          global.__wattanamPluginAudience = await context.directory.resolveAudience({ audience: 'SCHOOL' });
          context.realtime.notifyUser('user-1', 'note:new', { id: 'n1' });
          try { await context.database.query('SELECT * FROM "User"', []); } catch (error) { global.__wattanamPluginNamespaceError = error.message; }
        }
      };
    `);
    const manifest = {
      id: 'wattanam.test', version: '1.0.0', backendEntry: 'backend/index.js',
      capabilities: ['database.read', 'database.write', 'directory.read', 'realtime.notify'], permissions: [], dependencies: {},
    };
    const prisma = {
      pluginInstallation: { findUnique: jest.fn().mockResolvedValue({ id: 'wattanam.test', version: '1.0.0', installedPath }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'n1' }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    } as any;
    const verifier = { verifyInstalledDirectory: jest.fn().mockResolvedValue({ manifest }) } as any;
    const [extensions, jobs, settings, storage, notifications, directoryService, realtime] = dependencies();
    const runtime = new PluginRuntimeService(prisma, verifier, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any, notifications as any, directoryService as any, realtime as any);

    await runtime.load('wattanam.test');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT * FROM plugin_wattanam_test_notes WHERE id = $1', 'n1');
    expect((global as any).__wattanamPluginRows).toEqual([{ id: 'n1' }]);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith('INSERT INTO plugin_wattanam_test_notes (id) VALUES ($1)', 'n1');
    expect((global as any).__wattanamPluginWrite).toEqual({ count: 1 });
    expect(directoryService.resolveAudience).toHaveBeenCalledWith({ audience: 'SCHOOL' });
    expect(realtime.notifyUser).toHaveBeenCalledWith('wattanam.test', 'user-1', 'note:new', { id: 'n1' });
    expect((global as any).__wattanamPluginNamespaceError).toMatch(/only access tables beginning with plugin_wattanam_test_/);
    delete (global as any).__wattanamPluginRows;
    delete (global as any).__wattanamPluginWrite;
    delete (global as any).__wattanamPluginAudience;
    delete (global as any).__wattanamPluginNamespaceError;
  });

  it('refuses database.execute when the plugin only declared database.read', async () => {
    const installedPath = path.join(directory, 'wattanam.test', '1.0.0');
    await fs.mkdir(path.join(installedPath, 'backend'), { recursive: true });
    await fs.writeFile(path.join(installedPath, 'backend', 'index.js'), `
      module.exports = {
        id: 'wattanam.test',
        activate(context) { return context.database.execute('DELETE FROM plugin_wattanam_test_notes WHERE id = $1', ['n1']); }
      };
    `);
    const manifest = { id: 'wattanam.test', version: '1.0.0', backendEntry: 'backend/index.js', capabilities: ['database.read'], permissions: [], dependencies: {} };
    const prisma = { pluginInstallation: { findUnique: jest.fn().mockResolvedValue({ id: 'wattanam.test', version: '1.0.0', installedPath }) }, $executeRawUnsafe: jest.fn() } as any;
    const verifier = { verifyInstalledDirectory: jest.fn().mockResolvedValue({ manifest }) } as any;
    const [extensions, jobs, settings, storage, notifications, directoryService, realtime] = dependencies();
    const runtime = new PluginRuntimeService(prisma, verifier, new PluginEventBus(), extensions as any, jobs as any, settings as any, storage as any, notifications as any, directoryService as any, realtime as any);
    await expect(runtime.load('wattanam.test')).rejects.toThrow('did not declare database.write');
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
