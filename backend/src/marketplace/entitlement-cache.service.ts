import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { readEntitlementConfig } from './entitlement-config';
import { verifyFetchedEntitlement } from './entitlement-verification';
import { InstallationKeyService } from './installation-key.service';
import { readMarketplaceIdentityConfig } from './marketplace-identity-config';

const BACKOFF_MINUTES = [1, 5, 15, 60];

/**
 * Caches signed marketplace entitlements locally so plugin licensing survives a
 * marketplace outage. This service only ever reads and refreshes the cache — it is
 * deliberately never consulted to gate plugin install/activation. A marketplace
 * outage or a rejected refresh must never disable functionality a school already has.
 */
@Injectable()
export class EntitlementCacheService {
  private readonly logger = new Logger(EntitlementCacheService.name);

  constructor(private readonly prisma: PrismaService, private readonly keys: InstallationKeyService, private readonly audit: AuditService) {}

  @Cron('0 */6 * * *')
  async refreshAll(now = new Date()) {
    if (!readMarketplaceIdentityConfig() || !readEntitlementConfig()) return;
    const plugins = await this.prisma.pluginInstallation.findMany({ select: { id: true } });
    for (const plugin of plugins) {
      try { await this.refreshOne(plugin.id, now); }
      catch (error) { this.logger.warn(`Entitlement refresh failed for ${plugin.id}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }

  async refreshOne(pluginId: string, now = new Date()) {
    const config = readMarketplaceIdentityConfig();
    const entitlementConfig = readEntitlementConfig();
    if (!config || !entitlementConfig) throw new ServiceUnavailableException('Marketplace entitlement checking is not configured');
    const cache = await this.prisma.pluginEntitlementCache.findUnique({ where: { pluginId } });
    if (cache && !this.dueForRefresh(cache, now)) return cache;

    const installation = await this.prisma.installation.findUnique({ where: { id: 'singleton' }, select: { installationId: true } });
    if (!installation) throw new BadRequestException('This school has not completed first-run installation yet');

    const ts = String(Math.floor(now.getTime() / 1000));
    const signature = await this.keys.sign({ installationId: installation.installationId, pluginId, ts });
    const url = new URL(`/v1/installations/${installation.installationId}/entitlements/${pluginId}`, config.marketplaceUrl);
    url.searchParams.set('ts', ts);
    url.searchParams.set('signature', signature);

    let response: Response;
    try {
      response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(config.requestTimeoutMs), headers: { accept: 'application/json' } });
    } catch {
      return this.recordFailure(pluginId, 'Marketplace is unreachable', now);
    }

    if (response.status === 404) return this.handleNoEntitlement(pluginId, cache, now);
    if (!response.ok) return this.recordFailure(pluginId, `Marketplace responded with ${response.status}`, now);

    let body: any;
    try { body = await response.json(); } catch { return this.recordFailure(pluginId, 'Marketplace returned invalid JSON', now); }

    let payload;
    try {
      payload = verifyFetchedEntitlement(body.signedToken, entitlementConfig.publicKeys, { installationId: installation.installationId, productId: pluginId, now });
    } catch (error) {
      await this.audit.log({
        action: 'entitlement_verification_failed', resource: 'PLUGIN_ENTITLEMENT', resourceId: pluginId, success: false,
        metadata: { reason: error instanceof Error ? error.message : String(error) },
      });
      return this.recordFailure(pluginId, 'Entitlement verification failed', now);
    }

    const fields = {
      status: String(body.status), tokenId: payload.tokenId, signedTokenJson: JSON.stringify(body.signedToken),
      expiresAt: new Date(payload.expiresAt), updatesThrough: new Date(payload.updatesThrough), offlineRecheckAfter: new Date(payload.offlineRecheckAfter),
      lastVerifiedAt: now, lastRefreshAttemptAt: now, lastRefreshSucceededAt: now, consecutiveFailures: 0, lastError: null,
    };
    return this.prisma.pluginEntitlementCache.upsert({ where: { pluginId }, create: { pluginId, ...fields }, update: fields });
  }

  async getStatus(pluginId: string) {
    return this.prisma.pluginEntitlementCache.findUnique({ where: { pluginId } });
  }

  async getAllStatuses() {
    return this.prisma.pluginEntitlementCache.findMany();
  }

  async exportOne(pluginId: string) {
    const cache = await this.prisma.pluginEntitlementCache.findUnique({ where: { pluginId } });
    if (!cache?.signedTokenJson) throw new BadRequestException('No verified entitlement is cached for this plugin');
    return { schemaVersion: 1, pluginId, status: cache.status, signedToken: JSON.parse(cache.signedTokenJson), exportedAt: new Date().toISOString() };
  }

  async importOne(pluginId: string, signedToken: unknown, now = new Date()) {
    const entitlementConfig = readEntitlementConfig();
    if (!entitlementConfig) throw new ServiceUnavailableException('Marketplace entitlement keys are not configured');
    const installation = await this.prisma.installation.findUnique({ where: { id: 'singleton' }, select: { installationId: true } });
    if (!installation) throw new BadRequestException('This school has not completed first-run installation yet');
    let payload;
    try {
      payload = verifyFetchedEntitlement(signedToken, entitlementConfig.publicKeys, { installationId: installation.installationId, productId: pluginId, now });
    } catch (error) {
      await this.audit.log({ action: 'entitlement_offline_import_failed', resource: 'PLUGIN_ENTITLEMENT', resourceId: pluginId, success: false, metadata: { reason: error instanceof Error ? error.message : String(error) } });
      throw new BadRequestException('Offline entitlement token is invalid');
    }
    const fields = {
      status: 'ACTIVE', tokenId: payload.tokenId, signedTokenJson: JSON.stringify(signedToken), expiresAt: new Date(payload.expiresAt),
      updatesThrough: new Date(payload.updatesThrough), offlineRecheckAfter: new Date(payload.offlineRecheckAfter),
      lastVerifiedAt: now, lastRefreshAttemptAt: null, lastRefreshSucceededAt: null, consecutiveFailures: 0, lastError: null,
    };
    const cache = await this.prisma.pluginEntitlementCache.upsert({ where: { pluginId }, create: { pluginId, ...fields }, update: fields });
    await this.audit.log({ action: 'entitlement_offline_imported', resource: 'PLUGIN_ENTITLEMENT', resourceId: pluginId, success: true, metadata: { tokenId: payload.tokenId } });
    return cache;
  }

  private async handleNoEntitlement(pluginId: string, cache: { status: string } | null, now: Date) {
    if (cache && cache.status !== 'NONE' && cache.status !== 'UNKNOWN') {
      return this.recordFailure(pluginId, 'Marketplace unexpectedly reports no entitlement for a previously known plugin', now);
    }
    const fields = {
      status: 'NONE', tokenId: null, signedTokenJson: null, expiresAt: null, updatesThrough: null, offlineRecheckAfter: null,
      lastVerifiedAt: now, lastRefreshAttemptAt: now, lastRefreshSucceededAt: now, consecutiveFailures: 0, lastError: null,
    };
    return this.prisma.pluginEntitlementCache.upsert({ where: { pluginId }, create: { pluginId, ...fields }, update: fields });
  }

  private async recordFailure(pluginId: string, message: string, now: Date) {
    const existing = await this.prisma.pluginEntitlementCache.findUnique({ where: { pluginId } });
    const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
    return this.prisma.pluginEntitlementCache.upsert({
      where: { pluginId },
      create: { pluginId, status: 'UNKNOWN', consecutiveFailures, lastError: message, lastRefreshAttemptAt: now },
      update: { consecutiveFailures, lastError: message, lastRefreshAttemptAt: now },
    });
  }

  private dueForRefresh(cache: { consecutiveFailures: number; lastRefreshAttemptAt: Date | null }, now: Date): boolean {
    if (!cache.lastRefreshAttemptAt) return true;
    const minutes = BACKOFF_MINUTES[Math.min(cache.consecutiveFailures, BACKOFF_MINUTES.length - 1)];
    return now.getTime() - cache.lastRefreshAttemptAt.getTime() >= minutes * 60_000;
  }
}
