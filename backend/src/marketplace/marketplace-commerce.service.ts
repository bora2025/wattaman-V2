import { BadGatewayException, BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import semver from 'semver';
import { readRuntimeConfig } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { PluginsService } from '../plugins/plugins.service';
import { TrustedPluginKeys } from '../plugins/plugin-package';
import { recordMarketplaceTrustedKey, trustedPluginKeys } from '../plugins/plugin-config';
import { readUpdateRepositoryConfig } from '../updates/update-config';
import { UpdatesService } from '../updates/updates.service';
import { MarketplaceLinkService } from './marketplace-link.service';
import { MarketplaceIdentityConfig, readMarketplaceIdentityConfig } from './marketplace-identity-config';

@Injectable()
export class MarketplaceCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly link: MarketplaceLinkService,
    private readonly updates: UpdatesService,
    private readonly plugins: PluginsService,
  ) {}

  async catalog() {
    const config = this.requireConfig();
    const token = await this.link.getValidAccessToken();
    const coreVersion = readRuntimeConfig().appVersion;
    const url = new URL('/v1/catalog', config.marketplaceUrl);
    url.searchParams.set('coreVersion', coreVersion);
    return this.getJson(config, url, token);
  }

  async listOrders() {
    const config = this.requireConfig();
    const token = await this.link.getValidAccessToken();
    return this.getJson(config, new URL('/v1/customer/orders', config.marketplaceUrl), token);
  }

  async createOrder(priceId: string, currency: string) {
    if (!priceId) throw new BadRequestException('priceId is required');
    if (!/^[A-Z]{3}$/.test(currency || '')) throw new BadRequestException('currency must be a 3-letter ISO code');
    const config = this.requireConfig();
    const token = await this.link.getValidAccessToken();
    const installationId = await this.installationId();
    // Generated here, not accepted from the SUPER_ADMIN's browser: a client-supplied key could be
    // replayed to probe or collide with a prior order's idempotency slot.
    const idempotencyKey = randomUUID();
    return this.postJson(config, '/v1/customer/orders', { installationId, currency, priceIds: [priceId], idempotencyKey }, token);
  }

  /**
   * Mirrors UpdatesService.installPlugin()'s fetch/verify/install pipeline (signed index ->
   * validated download URL -> checksum-verified artifact -> PluginsService.install()), but
   * downloads through the delegated commerce session so a paid artifact's entitlement check
   * (enforced marketplace-side on /v1/artifacts/:sha256) can pass, and is not limited to plugins
   * already installed -- installPlugin() never actually required that, it was just never called
   * this way. The one real difference is trust: a brand-new plugin's publisher may not be in this
   * school's static PLUGIN_TRUSTED_KEYS, so the one key named for this exact release in the
   * already-signed index is merged in for this call only.
   */
  async install(pluginId: string, version: string, activate: boolean) {
    if (!pluginId) throw new BadRequestException('pluginId is required');
    if (!semver.valid(version)) throw new BadRequestException('version must be semantic versioning');
    const updateConfig = readUpdateRepositoryConfig();
    if (!updateConfig) throw new ServiceUnavailableException('Update repository is not configured');
    const token = await this.link.getValidAccessToken();
    const coreVersion = readRuntimeConfig().appVersion;
    const payload = await this.updates.index(updateConfig, coreVersion);
    const release = payload.pluginReleases.find((candidate: any) => candidate.pluginId === pluginId && candidate.version === version);
    if (!release) throw new NotFoundException('Compatible repository release not found');
    const download = new URL(release.downloadUrl);
    if (download.origin !== updateConfig.url || !download.pathname.startsWith('/v1/artifacts/')) throw new BadGatewayException('Repository returned an untrusted artifact URL');
    if (!/^[a-f0-9]{64}$/.test(release.sha256)) throw new BadGatewayException('Repository returned an invalid artifact checksum');
    const buffer = await this.downloadArtifact(download, token, updateConfig);
    const digest = createHash('sha256').update(buffer).digest('hex');
    if (digest !== release.sha256) throw new BadGatewayException('Downloaded artifact checksum does not match signed metadata');
    const installed = await this.plugins.install(buffer, undefined, await this.mergeTrustedKeys(release));
    // Persisted so activation (and every restart-time reload of an active plugin) still
    // recognizes this publisher -- those calls only ever read trustedPluginKeys(), not this
    // one-off merge, so without this the plugin would install but could never actually run.
    if (release.publisherKeyId && release.publisherPublicKeyPem) {
      await recordMarketplaceTrustedKey(release.publisher, release.publisherKeyId, release.publisherPublicKeyPem);
    }
    return activate ? this.plugins.activate(installed.id) : installed;
  }

  /** Extends the static+persisted trust allow-list with the ONE publisher key the signed index
   * itself named for this exact release -- nothing else about install()'s verification changes,
   * so a manually-uploaded package's trust is completely unaffected. Needed for this first call
   * only: recordMarketplaceTrustedKey() below persists it before this method returns, so every
   * later call (including this same plugin's own activate() a few lines down) picks it up from
   * trustedPluginKeys() itself. */
  private async mergeTrustedKeys(release: { publisher: string; publisherKeyId?: string; publisherPublicKeyPem?: string }): Promise<TrustedPluginKeys> {
    const base = await trustedPluginKeys();
    if (!release.publisherKeyId || !release.publisherPublicKeyPem) return base;
    return {
      ...base,
      [release.publisher]: { ...(base[release.publisher] || {}), [release.publisherKeyId]: release.publisherPublicKeyPem },
    };
  }

  private async downloadArtifact(url: URL, token: string, config: NonNullable<ReturnType<typeof readUpdateRepositoryConfig>>): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(config.artifactTimeoutMs), redirect: 'error',
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.wattanam.plugin+zip' },
      });
    } catch {
      throw new BadGatewayException('Marketplace is unavailable');
    }
    if (!response.ok) throw new BadGatewayException(`Artifact download failed (${response.status})`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > config.maximumArtifactBytes) throw new BadGatewayException('Artifact exceeds the configured size limit');
    if (!response.body) throw new BadGatewayException('Artifact response has no body');
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of response.body as any) {
      const bytes = Buffer.from(chunk);
      received += bytes.length;
      if (received > config.maximumArtifactBytes) throw new BadGatewayException('Artifact exceeds the configured size limit');
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }

  private async installationId(): Promise<string> {
    const installation = await this.prisma.installation.findUnique({ where: { id: 'singleton' }, select: { installationId: true } });
    if (!installation) throw new BadRequestException('This school has not completed first-run installation yet');
    return installation.installationId;
  }

  private requireConfig(): MarketplaceIdentityConfig {
    const config = readMarketplaceIdentityConfig();
    if (!config) throw new ServiceUnavailableException('Marketplace integration is not configured (MARKETPLACE_URL is not set)');
    return config;
  }

  private async getJson(config: MarketplaceIdentityConfig, url: URL, token: string) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(config.requestTimeoutMs),
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      });
    } catch {
      throw new BadGatewayException('Marketplace is unavailable');
    }
    return this.parse(response);
  }

  private async postJson(config: MarketplaceIdentityConfig, urlPath: string, body: unknown, token: string) {
    let response: Response;
    try {
      response = await fetch(new URL(urlPath, config.marketplaceUrl), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.requestTimeoutMs),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new BadGatewayException('Marketplace is unavailable');
    }
    return this.parse(response);
  }

  private async parse(response: Response) {
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new BadGatewayException('Marketplace returned invalid JSON'); }
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `Marketplace responded with ${response.status}`;
      throw new BadGatewayException(message);
    }
    return payload;
  }
}
