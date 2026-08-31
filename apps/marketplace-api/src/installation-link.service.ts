import { Prisma, PrismaClient } from '@prisma/client';
import { verify } from 'node:crypto';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import { HttpError } from './http-error';
import { newOpaqueToken } from './identity-crypto';
import { canonicalJson } from './signing';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const REQUEST_LIFETIME_MS = 15 * 60 * 1000;
const GRANT_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;
const ALLOWED_SCOPE = 'catalog:browse purchase:create download:artifact';

const requestLinkInput = z.object({
  installationId: z.string().uuid(),
  requestedScope: z.literal(ALLOWED_SCOPE),
  ts: z.string().regex(/^\d{1,20}$/),
  signature: z.string().base64(),
});

const exchangeInput = z.object({
  installationId: z.string().uuid(),
  requestId: z.string().uuid(),
  ts: z.string().regex(/^\d{1,20}$/),
  signature: z.string().base64(),
});

export class InstallationLinkService {
  constructor(private readonly prisma: PrismaClient, private readonly config: MarketplaceConfig) {}

  async requestLink(value: unknown, now = new Date()) {
    const input = requestLinkInput.parse(value);
    const registration = await this.authenticateInstallation(input.installationId, { installationId: input.installationId, requestedScope: input.requestedScope, ts: input.ts }, input.signature, now);
    const request = await this.prisma.installationMarketplaceGrantRequest.create({
      data: { installationRegistrationId: registration.id, requestedScope: input.requestedScope, expiresAt: new Date(now.getTime() + REQUEST_LIFETIME_MS) },
    });
    return { requestId: request.id, approvalUrl: `${this.config.publicBaseUrl}/marketplace/link/${request.id}`, expiresAt: request.expiresAt };
  }

  async getRequest(requestId: string, now = new Date()) {
    const request = await this.prisma.installationMarketplaceGrantRequest.findUnique({
      where: { id: requestId }, include: { installation: { select: { label: true, installationId: true } } },
    });
    if (!request) throw new HttpError(404, 'Link request not found');
    const status = request.status === 'PENDING' && request.expiresAt <= now ? 'EXPIRED' : request.status;
    return {
      requestId: request.id, status, requestedScope: request.requestedScope, expiresAt: request.expiresAt,
      installationLabel: request.installation.label, installationId: request.installation.installationId,
    };
  }

  async approve(requestId: string, accountId: string, now = new Date()) {
    return this.decide(requestId, accountId, 'APPROVED', now);
  }

  async deny(requestId: string, accountId: string, now = new Date()) {
    return this.decide(requestId, accountId, 'DENIED', now);
  }

  private async decide(requestId: string, accountId: string, decision: 'APPROVED' | 'DENIED', now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.installationMarketplaceGrantRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new HttpError(404, 'Link request not found');
      if (request.status !== 'PENDING') throw new HttpError(409, `Link request cannot be decided from ${request.status}`);
      if (request.expiresAt <= now) {
        await tx.installationMarketplaceGrantRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } });
        throw new HttpError(410, 'Link request has expired');
      }
      if (decision === 'DENIED') {
        await tx.installationMarketplaceGrantRequest.update({ where: { id: request.id }, data: { status: 'DENIED', respondedAt: now } });
        await this.audit(tx, { accountId, action: 'installation_link_denied', success: true, metadata: { requestId } });
        return { status: 'DENIED' as const };
      }
      const grant = await tx.installationMarketplaceGrant.upsert({
        where: { installationRegistrationId: request.installationRegistrationId },
        create: { installationRegistrationId: request.installationRegistrationId, accountId, scope: request.requestedScope, consentedAt: now, expiresAt: new Date(now.getTime() + GRANT_LIFETIME_MS) },
        update: { accountId, scope: request.requestedScope, consentedAt: now, expiresAt: new Date(now.getTime() + GRANT_LIFETIME_MS), revokedAt: null, revokedReason: null },
      });
      await tx.installationMarketplaceGrantRequest.update({ where: { id: request.id }, data: { status: 'APPROVED', respondedAt: now, grantId: grant.id } });
      await this.audit(tx, { accountId, action: 'installation_link_approved', success: true, metadata: { requestId, installationRegistrationId: request.installationRegistrationId } });
      return { status: 'APPROVED' as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async exchange(value: unknown, now = new Date()) {
    const input = exchangeInput.parse(value);
    const registration = await this.authenticateInstallation(input.installationId, { installationId: input.installationId, requestId: input.requestId, ts: input.ts }, input.signature, now);
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.installationMarketplaceGrantRequest.findUnique({ where: { id: input.requestId } });
      if (!request || request.installationRegistrationId !== registration.id) throw new HttpError(404, 'Link request not found');
      if (request.status === 'PENDING' && request.expiresAt <= now) {
        await tx.installationMarketplaceGrantRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } });
        return { pending: false as const, status: 'EXPIRED' as const };
      }
      if (request.status === 'PENDING') return { pending: true as const };
      if (request.status === 'DENIED' || request.status === 'EXPIRED') return { pending: false as const, status: request.status };
      if (request.status === 'DELIVERED') throw new HttpError(410, 'Link request has already been exchanged');
      const grant = request.grantId ? await tx.installationMarketplaceGrant.findUnique({ where: { id: request.grantId } }) : null;
      if (!grant || grant.revokedAt) throw new HttpError(409, 'Grant is no longer active');
      const account = await tx.marketplaceAccount.findUnique({ where: { id: grant.accountId }, select: { email: true } });
      const token = newOpaqueToken();
      const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
      await tx.marketplaceSession.create({ data: { accountId: grant.accountId, tokenHash: token.hash, scope: 'COMMERCE_PROXY', sourceGrantId: grant.id, expiresAt } });
      await tx.installationMarketplaceGrantRequest.update({ where: { id: request.id }, data: { deliveredAt: now, status: 'DELIVERED' } });
      await this.audit(tx, { accountId: grant.accountId, action: 'installation_link_delivered', success: true, metadata: { requestId: request.id, installationRegistrationId: registration.id } });
      return { pending: false as const, status: 'DELIVERED' as const, sessionToken: token.raw, expiresAt, accountId: grant.accountId, accountEmail: account?.email, scope: grant.scope, grantId: grant.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.pending) return { status: 'pending' as const };
    if (result.status === 'DENIED') throw new HttpError(403, 'Link request was denied');
    if (result.status === 'EXPIRED') throw new HttpError(410, 'Link request has expired');
    return result;
  }

  async revoke(grantId: string, requester: { accountId: string; scope: string; sourceGrantId?: string }, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.installationMarketplaceGrant.findUnique({ where: { id: grantId } });
      if (!grant) throw new HttpError(404, 'Grant not found');
      if (grant.accountId !== requester.accountId) throw new HttpError(404, 'Grant not found');
      if (requester.scope === 'COMMERCE_PROXY' && requester.sourceGrantId !== grantId) throw new HttpError(403, 'A delegated session may only revoke its own grant');
      if (!grant.revokedAt) {
        await tx.installationMarketplaceGrant.update({ where: { id: grant.id }, data: { revokedAt: now, revokedReason: 'revoked' } });
      }
      await tx.marketplaceSession.updateMany({ where: { sourceGrantId: grant.id, revokedAt: null }, data: { revokedAt: now } });
      await this.audit(tx, { accountId: requester.accountId, action: 'installation_link_revoked', success: true, metadata: { grantId } });
      return { revoked: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async authenticateInstallation(installationId: string, payload: Record<string, unknown>, signatureBase64: string, now: Date) {
    const tsMillis = Number((payload as { ts: string }).ts) * 1000;
    if (!Number.isFinite(tsMillis) || Math.abs(now.getTime() - tsMillis) > FRESHNESS_WINDOW_MS) throw new HttpError(401, 'Request timestamp is outside the freshness window');
    const registration = await this.prisma.installationRegistration.findUnique({
      where: { installationId }, include: { keys: { where: { revokedAt: null } } },
    });
    const activeKey = registration?.keys[0];
    if (!registration || !activeKey) throw new HttpError(409, 'Installation must complete registration before linking a marketplace account');
    const bytes = Buffer.from(canonicalJson(payload));
    let valid: boolean;
    try {
      valid = verify(null, bytes, activeKey.publicKeyPem, Buffer.from(signatureBase64, 'base64'));
    } catch {
      throw new HttpError(401, 'Signature could not be verified');
    }
    if (!valid) throw new HttpError(401, 'Signature is invalid');
    return registration;
  }

  private async audit(tx: Prisma.TransactionClient, entry: { accountId?: string; action: string; success: boolean; metadata?: Prisma.InputJsonValue }) {
    await tx.marketplaceAuditEvent.create({ data: entry });
  }
}
