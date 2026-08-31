import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { InstallationKeyService } from './installation-key.service';
import { MarketplaceLinkTokenStore } from './marketplace-link-token.store';
import { MarketplaceIdentityConfig, readMarketplaceIdentityConfig } from './marketplace-identity-config';

const REQUESTED_SCOPE = 'catalog:browse purchase:create download:artifact';

function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

@Injectable()
export class MarketplaceLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: InstallationKeyService,
    private readonly tokenStore: MarketplaceLinkTokenStore,
  ) {}

  async start(label?: string) {
    const config = this.requireConfig();
    const installationId = await this.installationId();
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = await this.keys.sign({ installationId, requestedScope: REQUESTED_SCOPE, ts });
    const result = await this.postJson(config, `/v1/installations/${installationId}/marketplace-links`, { installationId, requestedScope: REQUESTED_SCOPE, ts, signature, label });
    if (result.status !== 201) throw new BadGatewayException(errorMessage(result.body));
    return { requestId: result.body.requestId, approvalUrl: result.body.approvalUrl, expiresAt: result.body.expiresAt };
  }

  async poll(requestId: string) {
    if (!requestId) throw new BadRequestException('requestId is required');
    const config = this.requireConfig();
    const installationId = await this.installationId();
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = await this.keys.sign({ installationId, requestId, ts });
    const result = await this.postJson(config, `/v1/installations/${installationId}/marketplace-links/${requestId}/exchange`, { installationId, requestId, ts, signature });
    if (result.status === 202) return { status: 'pending' as const };
    if (result.status === 403) return { status: 'denied' as const };
    if (result.status === 410) return { status: 'expired' as const };
    if (result.status !== 200) throw new BadGatewayException(errorMessage(result.body));
    const body = result.body as { sessionToken: string; expiresAt: string; accountId: string; accountEmail?: string; scope: string; grantId: string };
    await this.tokenStore.write(body.sessionToken);
    const now = new Date();
    await this.prisma.marketplaceProxyLink.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton', grantId: body.grantId, accountId: body.accountId, accountEmailMasked: maskEmail(body.accountEmail),
        scope: body.scope, linkedAt: now, expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), sessionExpiresAt: new Date(body.expiresAt),
      },
      update: {
        grantId: body.grantId, accountId: body.accountId, accountEmailMasked: maskEmail(body.accountEmail),
        scope: body.scope, linkedAt: now, expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), sessionExpiresAt: new Date(body.expiresAt), revokedAt: null,
      },
    });
    return { status: 'linked' as const, accountEmailMasked: maskEmail(body.accountEmail), scope: body.scope };
  }

  async status() {
    const link = await this.prisma.marketplaceProxyLink.findUnique({ where: { id: 'singleton' } });
    if (!link || link.revokedAt) return { linked: false as const };
    return { linked: true as const, accountEmailMasked: link.accountEmailMasked, scope: link.scope, linkedAt: link.linkedAt, expiresAt: link.expiresAt };
  }

  async revoke() {
    const link = await this.prisma.marketplaceProxyLink.findUnique({ where: { id: 'singleton' } });
    if (!link || link.revokedAt) return { revoked: true };
    const config = this.requireConfig();
    const token = await this.tokenStore.read();
    if (token) {
      try {
        await fetch(new URL(`/v1/marketplace-links/${link.grantId}/revoke`, config.marketplaceUrl), {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.requestTimeoutMs),
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        });
      } catch {
        // Best-effort: the marketplace-side grant will also expire on its own (90-day cap) and the
        // account owner can always revoke it from their own portal. Local state must still clear.
      }
    }
    await this.tokenStore.clear();
    await this.prisma.marketplaceProxyLink.update({ where: { id: 'singleton' }, data: { revokedAt: new Date() } });
    return { revoked: true };
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

  private async postJson(config: MarketplaceIdentityConfig, urlPath: string, body: unknown): Promise<{ status: number; body: any }> {
    const url = new URL(urlPath, config.marketplaceUrl);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.requestTimeoutMs),
        headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
      });
    } catch {
      throw new BadGatewayException('Marketplace is unavailable');
    }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new BadGatewayException('Marketplace returned invalid JSON'); }
    return { status: response.status, body: payload };
  }
}

function errorMessage(body: unknown): string {
  return body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : 'Marketplace request failed';
}
