import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createPublicKey, generateKeyPairSync } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { InstallationKeyService } from './installation-key.service';
import { MarketplaceIdentityConfig, readMarketplaceIdentityConfig } from './marketplace-identity-config';

@Injectable()
export class InstallationRegistrationService {
  constructor(private readonly prisma: PrismaService, private readonly keys: InstallationKeyService) {}

  /**
   * Local-only status. Deliberately never contacts the marketplace: an outage must not make the
   * licensing screen hang or appear broken. The marketplace stays the authority on whether this
   * installation is registered, and says so when register/rotate is actually attempted.
   */
  async status() {
    const installation = await this.installationId();
    const key = await this.keys.ensureKeyPair().catch(() => null);
    return {
      installationId: installation,
      hasLocalKey: !!key,
      keyFingerprint: key?.fingerprint ?? null,
      marketplaceConfigured: !!readMarketplaceIdentityConfig(),
    };
  }

  /**
   * `enrollmentToken` is the one-time secret a platform operator minted for this school before it
   * was deployed. It is optional: a school that has no token (a self-hosted installation, or any
   * of the schools that registered before the customer directory existed) registers exactly as it
   * always did. Passing one binds this installation to that customer record on the marketplace
   * side, which is what lets the operator console show a named school rather than a bare UUID.
   *
   * Deliberately not persisted here. It is single-use and is spent the moment this call succeeds,
   * so keeping a copy in the school's database would only create a secret with no remaining
   * purpose.
   */
  async register(accountId: string, label?: string, enrollmentToken?: string) {
    const config = this.requireConfig();
    const installationId = await this.installationId();
    const { publicKeyPem } = await this.keys.ensureKeyPair();
    const challenge = await this.requestChallenge(config, installationId, 'register');
    const signature = await this.keys.sign({ installationId, challengeId: challenge.challengeId, nonce: challenge.nonce, purpose: 'register' });
    const token = enrollmentToken?.trim();
    return this.postJson(config, '/v1/installations/register', {
      accountId, installationId, label, publicKeyPem, challengeId: challenge.challengeId, signature,
      ...(token ? { enrollmentToken: token } : {}),
    });
  }

  async rotateKey() {
    const config = this.requireConfig();
    const installationId = await this.installationId();
    const challenge = await this.requestChallenge(config, installationId, 'rotate');
    const nextPair = generateKeyPairSync('ed25519');
    const newPrivateKeyPem = nextPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const newPublicKeyPem = nextPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const newKeyFingerprint = fingerprintOf(newPublicKeyPem);
    const signature = await this.keys.sign({ installationId, challengeId: challenge.challengeId, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint });
    const result = await this.postJson(config, `/v1/installations/${installationId}/keys/rotate`, { challengeId: challenge.challengeId, signature, newPublicKeyPem });
    await this.keys.replaceKeyPair(newPrivateKeyPem);
    return result;
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

  private async requestChallenge(config: MarketplaceIdentityConfig, installationId: string, purpose: 'register' | 'rotate') {
    return this.postJson(config, '/v1/installations/challenges', { installationId, purpose });
  }

  private async postJson(config: MarketplaceIdentityConfig, urlPath: string, body: unknown): Promise<any> {
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
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `Marketplace responded with ${response.status}`;
      throw new BadGatewayException(message);
    }
    return payload;
  }
}

function fingerprintOf(publicKeyPem: string): string {
  return createHash('sha256').update(createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })).digest('hex');
}
