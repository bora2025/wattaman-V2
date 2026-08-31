import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { readRuntimeConfig } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { MarketplaceLinkService } from './marketplace-link.service';
import { MarketplaceIdentityConfig, readMarketplaceIdentityConfig } from './marketplace-identity-config';

@Injectable()
export class MarketplaceCommerceService {
  constructor(private readonly prisma: PrismaService, private readonly link: MarketplaceLinkService) {}

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
