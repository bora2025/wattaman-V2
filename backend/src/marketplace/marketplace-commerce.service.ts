import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { readRuntimeConfig } from '../config/environment';
import { MarketplaceLinkService } from './marketplace-link.service';
import { MarketplaceIdentityConfig, readMarketplaceIdentityConfig } from './marketplace-identity-config';

@Injectable()
export class MarketplaceCommerceService {
  constructor(private readonly link: MarketplaceLinkService) {}

  async catalog() {
    const config = this.requireConfig();
    const token = await this.link.getValidAccessToken();
    const coreVersion = readRuntimeConfig().appVersion;
    const url = new URL('/v1/catalog', config.marketplaceUrl);
    url.searchParams.set('coreVersion', coreVersion);
    return this.getJson(config, url, token);
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
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new BadGatewayException('Marketplace returned invalid JSON'); }
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `Marketplace responded with ${response.status}`;
      throw new BadGatewayException(message);
    }
    return payload;
  }
}
