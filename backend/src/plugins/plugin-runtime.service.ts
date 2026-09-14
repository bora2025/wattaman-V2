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
import { NotificationService } from '../notification/notification.service';
import { DirectoryService } from '../directory/directory.service';
import { PluginRealtimeService } from './plugin-realtime.service';
import { PluginNotificationQuotaService } from './plugin-notification-quota.service';
import { AuditService } from '../audit/audit.service';
import { assertNoForbiddenSql, assertPluginNamespace } from './plugin-sql-guard';
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
    private readonly notifications: NotificationService,
    private readonly directory: DirectoryService,
    private readonly realtime: PluginRealtimeService,
    private readonly notificationQuota: PluginNotificationQuotaService,
    private readonly audit: AuditService,
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
    const verified = await this.verifier.verifyInstalledDirectory(installedPath, await trustedPluginKeys(), readRuntimeConfig().appVersion);
    if (verified.manifest.id !== id || verified.manifest.version !== record.version) throw new Error('Installed plugin identity does not match registry');
    if (!verified.manifest.backendEntry) return;
    const entry = path.resolve(installedPath, verified.manifest.backendEntry);
    if (!entry.startsWith(`${installedPath}${path.sep}`)) throw new Error('Plugin backend entry escapes installation directory');
    delete require.cache[require.resolve(entry)];
    const pluginModule = require(entry) as RuntimePluginModule;
    if (pluginModule.id !== id || typeof pluginModule.activate !== 'function') throw new Error('Plugin backend entry does not implement the lifecycle contract');

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
        readBinary: (name) => { requireCapability('storage.read'); return this.storage.readBinary(id, name); },
        writeBinary: (name, value) => { requireCapability('storage.write'); return this.storage.writeBinary(id, name, value); },
        delete: (name) => { requireCapability('storage.write'); return this.storage.delete(id, name); },
        list: (prefix) => { requireCapability('storage.read'); return this.storage.list(id, prefix); },
      },
      permissions: { register: (definitions) => { requireCapability('permissions.register'); const dispose = this.extensions.registerPermissions(id, declaredPermissions, definitions.map((definition) => ({ ...definition, pluginId: id }))); disposers.push(dispose); return dispose; } },
      navigation: { register: (entries) => { requireCapability('navigation.register'); const dispose = this.extensions.registerNavigation(id, declaredPermissions, entries.map((entry) => ({ ...entry, pluginId: id }))); disposers.push(dispose); return dispose; } },
      notifications: {
        sendEmail: (to, subject, text) => { requireCapability('notifications.send'); return this.sendNotification(id, 'email', { to, subject }, () => this.notifications.sendEmail(to, subject, text)); },
        sendSms: (to, body) => { requireCapability('notifications.send'); return this.sendNotification(id, 'sms', { to }, () => this.notifications.sendSms(to, body)); },
        notifyInApp: (userId, message, type) => { requireCapability('notifications.send'); return this.sendNotification(id, 'in_app', { to: userId, type }, () => this.notifications.notifyInApp(userId, message, type)); },
      },
      database: {
        query: (sql, params = []) => {
          requireCapability('database.read');
          const label = `Plugin ${id} query`;
          if (!/^\s*SELECT\b/i.test(sql)) throw new Error(`${label} must be a SELECT statement`);
          if ((sql.match(/;/g) || []).length > 1) throw new Error(`${label} must contain exactly one SQL statement`);
          assertNoForbiddenSql(sql, label);
          assertPluginNamespace(id, sql, label);
          return this.prisma.$queryRawUnsafe(sql, ...params);
        },
        execute: async (sql, params = []) => {
          requireCapability('database.write');
          const label = `Plugin ${id} execute`;
          if (!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) throw new Error(`${label} must be an INSERT, UPDATE, or DELETE statement`);
          if ((sql.match(/;/g) || []).length > 1) throw new Error(`${label} must contain exactly one SQL statement`);
          assertNoForbiddenSql(sql, label);
          assertPluginNamespace(id, sql, label);
          const count = await this.prisma.$executeRawUnsafe(sql, ...params);
          return { count };
        },
      },
      directory: {
        resolveAudience: (query) => { requireCapability('directory.read'); return this.directory.resolveAudience(query); },
        lookupUsers: (ids) => { requireCapability('directory.read'); return this.directory.lookupUsers(ids); },
        lookupClasses: (ids) => { requireCapability('directory.read'); return this.directory.lookupClasses(ids); },
        classesForUser: (userId, role) => { requireCapability('directory.read'); return this.directory.classesForUser(userId, role); },
      },
      realtime: {
        notifyUser: (userId, event, payload) => { requireCapability('realtime.notify'); this.realtime.notifyUser(id, userId, event, payload); },
      },
    };
    try {
      if (verified.manifest.frontendEntry) {
        requireCapability('ui.pages');
        let descriptor: unknown;
        try { descriptor = JSON.parse(verified.files.get(verified.manifest.frontendEntry)!.toString('utf8')); }
        catch { throw new Error('Plugin frontend entry must be valid declarative JSON'); }
        const dispose = this.extensions.registerPage(id, descriptor, declaredPermissions); disposers.push(dispose);
      }
      const cleanup = await pluginModule.activate(context);
      if (pluginModule.health) {
        const health = await pluginModule.health();
        if (health === false || (health && typeof health === 'object' && (health as any).status === 'failed')) throw new Error('Plugin health check failed');
      }
      this.loaded.set(id, { module: pluginModule, context, cleanup: typeof cleanup === 'function' ? cleanup : undefined, disposers });
      this.logger.log(`Activated ${id}@${record.version}`);
    } catch (error) {
      for (const dispose of disposers.reverse()) { try { dispose(); } catch { /* best effort */ } }
      this.extensions.clear(id); await this.jobs.clear(id);
      throw error;
    }
  }

  /**
   * Every plugin notification send goes through here: checked against the
   * plugin's daily quota (a single atomic upsert-increment, so concurrent
   * sends from the same plugin can't race past the limit) and audit-logged
   * (denied, failed, or succeeded), mirroring how PluginExtensionsService
   * already audits every route dispatch.
   */
  private async sendNotification<T>(pluginId: string, channel: string, metadata: Record<string, unknown>, send: () => Promise<T>): Promise<T> {
    const quota = await this.notificationQuota.recordAndCheck(pluginId);
    const auditBase = { actorRole: 'PLUGIN', action: 'PLUGIN_NOTIFICATION_SEND', resource: 'PLUGIN', resourceId: pluginId, metadata: { ...metadata, channel } };
    if (!quota.allowed) {
      void this.audit.log({ ...auditBase, success: false, errorMessage: `Daily notification quota exceeded (${quota.count}/${quota.limit})` });
      throw new Error(`${pluginId} exceeded its daily notification quota (${quota.limit}/day)`);
    }
    try {
      const result = await send();
      void this.audit.log({ ...auditBase, success: true });
      return result;
    } catch (error) {
      void this.audit.log({ ...auditBase, success: false, errorMessage: error instanceof Error ? error.message : String(error) });
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
