import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import path from 'path';
import { PrismaService } from '../database/prisma.service';
import { readRuntimeConfig } from '../config/environment';
import { trustedPluginKeys } from './plugin-config';
import { PluginEventBus } from './plugin-events';
import { PluginPackageVerifier } from './plugin-package';
import { PluginExtensionsService } from './plugin-extensions.service';
import { PluginJobsService } from './plugin-jobs.service';
import { PluginSettingsService } from './plugin-settings.service';
import { PluginStorageService } from './plugin-storage.service';
import { PluginRuntimeContext, RuntimePluginModule } from './plugin-sdk';

@Injectable()
export class PluginRuntimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PluginRuntimeService.name);
  private readonly loaded = new Map<string, { module: RuntimePluginModule; context: PluginRuntimeContext; cleanup?: () => void; disposers: Array<() => void> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: PluginPackageVerifier,
    private readonly eventBus: PluginEventBus,
    private readonly extensions: PluginExtensionsService,
    private readonly jobs: PluginJobsService,
    private readonly settings: PluginSettingsService,
    private readonly storage: PluginStorageService,
  ) {}

  async onApplicationBootstrap() {
    if (this.safeMode()) {
      this.logger.warn('PLUGIN_SAFE_MODE is enabled; no plugin code will be loaded');
      return;
    }
    const active = await this.prisma.pluginInstallation.findMany({ where: { status: 'active' } });
    for (const plugin of active) {
      try { await this.load(plugin.id); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to load ${plugin.id}: ${message}`);
        await this.prisma.pluginInstallation.update({ where: { id: plugin.id }, data: { status: 'failed', lastError: message } });
      }
    }
    this.eventBus.publish('core.system.started.v1', { startedAt: new Date().toISOString() });
  }

  async onApplicationShutdown() {
    for (const id of [...this.loaded.keys()].reverse()) await this.unload(id);
  }

  async load(id: string) {
    if (this.safeMode()) throw new Error('Plugin activation is disabled while PLUGIN_SAFE_MODE is enabled');
    if (this.loaded.has(id)) return;
    const record = await this.prisma.pluginInstallation.findUnique({ where: { id } });
    if (!record) throw new Error(`Plugin registry entry not found: ${id}`);
    const root = this.pluginRoot();
    const installedPath = path.resolve(record.installedPath);
    if (!installedPath.startsWith(`${root}${path.sep}`)) throw new Error(`Plugin path is outside PLUGIN_DIR: ${id}`);
    const verified = await this.verifier.verifyInstalledDirectory(installedPath, trustedPluginKeys(), readRuntimeConfig().appVersion);
    if (verified.manifest.id !== id || verified.manifest.version !== record.version) throw new Error('Installed plugin identity does not match registry');
    if (!verified.manifest.backendEntry) return;
    const entry = path.resolve(installedPath, verified.manifest.backendEntry);
    if (!entry.startsWith(`${installedPath}${path.sep}`)) throw new Error('Plugin backend entry escapes installation directory');
    delete require.cache[require.resolve(entry)];
    const module = require(entry) as RuntimePluginModule;
    if (module.id !== id || typeof module.activate !== 'function') throw new Error('Plugin backend entry does not implement the lifecycle contract');

    const capabilities = new Set(verified.manifest.capabilities);
    const declaredPermissions = new Set(verified.manifest.permissions);
    const logger = new Logger(`Plugin:${id}`);
    const disposers: Array<() => void> = [];
    const requireCapability = (capability: string) => {
      if (!capabilities.has(capability)) throw new Error(`${id} did not declare ${capability}`);
    };
    const context: PluginRuntimeContext = {
      sdkVersion: '1.0.0',
      pluginId: id,
      logger,
      events: {
        publish: (event, payload) => {
          requireCapability('events.publish');
          this.eventBus.publish(event, payload);
        },
        subscribe: (event, handler) => {
          requireCapability('events.subscribe');
          const dispose = this.eventBus.subscribe(event, handler); disposers.push(dispose); return dispose;
        },
      },
      routes: { register: (definition) => { requireCapability('api.routes'); const dispose = this.extensions.registerRoute(id, declaredPermissions, definition); disposers.push(dispose); return dispose; } },
      jobs: { register: async (definition) => { requireCapability('jobs.schedule'); const dispose = await this.jobs.register(id, definition); disposers.push(dispose); return dispose; } },
      settings: {
        get: (key, fallback) => { requireCapability('settings.read'); return this.settings.get(id, key, fallback); },
        set: (key, value) => { requireCapability('settings.write'); return this.settings.set(id, key, value); },
        delete: (key) => { requireCapability('settings.write'); return this.settings.delete(id, key); },
      },
      storage: {
        readText: (name) => { requireCapability('storage.read'); return this.storage.readText(id, name); },
        writeText: (name, value) => { requireCapability('storage.write'); return this.storage.writeText(id, name, value); },
        delete: (name) => { requireCapability('storage.write'); return this.storage.delete(id, name); },
        list: (prefix) => { requireCapability('storage.read'); return this.storage.list(id, prefix); },
      },
      permissions: { register: (definitions) => { requireCapability('permissions.register'); const dispose = this.extensions.registerPermissions(id, declaredPermissions, definitions.map((definition) => ({ ...definition, pluginId: id }))); disposers.push(dispose); return dispose; } },
      navigation: { register: (entries) => { requireCapability('navigation.register'); const dispose = this.extensions.registerNavigation(id, declaredPermissions, entries.map((entry) => ({ ...entry, pluginId: id }))); disposers.push(dispose); return dispose; } },
    };
    try {
      if (verified.manifest.frontendEntry) {
        requireCapability('ui.pages');
        let descriptor: unknown;
        try { descriptor = JSON.parse(verified.files.get(verified.manifest.frontendEntry)!.toString('utf8')); }
        catch { throw new Error('Plugin frontend entry must be valid declarative JSON'); }
        const dispose = this.extensions.registerPage(id, descriptor); disposers.push(dispose);
      }
      const cleanup = await module.activate(context);
      if (module.health) {
        const health = await module.health();
        if (health === false || (health && typeof health === 'object' && (health as any).status === 'failed')) throw new Error('Plugin health check failed');
      }
      this.loaded.set(id, { module, context, cleanup: typeof cleanup === 'function' ? cleanup : undefined, disposers });
      this.logger.log(`Activated ${id}@${record.version}`);
    } catch (error) {
      for (const dispose of disposers.reverse()) { try { dispose(); } catch { /* best effort */ } }
      this.extensions.clear(id); await this.jobs.clear(id);
      throw error;
    }
  }

  async unload(id: string) {
    const loaded = this.loaded.get(id);
    if (!loaded) return;
    await loaded.cleanup?.();
    await loaded.module.deactivate?.(loaded.context);
    for (const dispose of loaded.disposers.reverse()) { try { dispose(); } catch { /* best effort */ } }
    this.extensions.clear(id);
    await this.jobs.clear(id);
    this.loaded.delete(id);
    this.logger.log(`Deactivated ${id}`);
  }

  status() { return { safeMode: this.safeMode(), loaded: [...this.loaded.keys()].sort() }; }

  private pluginRoot() {
    return path.resolve(process.env.PLUGIN_DIR || (process.env.NODE_ENV === 'production' ? '/data/plugins' : './plugins-installed'));
  }

  private safeMode() { return process.env.PLUGIN_SAFE_MODE?.trim().toLowerCase() === 'true'; }
}
