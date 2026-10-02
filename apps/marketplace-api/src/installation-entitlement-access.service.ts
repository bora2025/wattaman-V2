import { Prisma, PrismaClient } from '@prisma/client';
import { verify } from 'node:crypto';
import { z } from 'zod';
import { schoolPaymentSignedPayload } from '@wattanam/marketplace-contracts';
import { HttpError } from './http-error';
import { canonicalJson } from './signing';
import { MarketplaceConfig } from './config';
import { issueEntitlement } from './entitlement';

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

const requestInput = z.object({
  installationId: z.string().uuid(),
  ts: z.string().regex(/^\d{1,20}$/),
  signature: z.string().base64(),
});

export class InstallationEntitlementAccessService {
  constructor(private readonly prisma: PrismaClient, private readonly config?: MarketplaceConfig) {}

  async getOne(params: { installationId: string; pluginId: string; ts: string; signature: string }, now = new Date()) {
    const { registrationId } = await this.authenticate(params, { installationId: params.installationId, pluginId: params.pluginId, ts: params.ts }, now);
    let entitlement = await this.prisma.installationEntitlement.findUnique({
      where: { installationId_pluginId: { installationId: registrationId, pluginId: params.pluginId } },
    });
    if (!entitlement) throw new HttpError(404, 'No entitlement exists for this plugin');
    const current = await this.upgradeLegacyToken(entitlement, now);
    return { pluginId: params.pluginId, status: current.status, signedToken: current.signedToken };
  }

  async getAll(params: { installationId: string; ts: string; signature: string }, now = new Date()) {
    const { registrationId } = await this.authenticate(params, { installationId: params.installationId, ts: params.ts }, now);
    const entitlements = await this.prisma.installationEntitlement.findMany({ where: { installationId: registrationId } });
    const current = await Promise.all(entitlements.map((entitlement) => this.upgradeLegacyToken(entitlement, now)));
    return { entitlements: current.map((entitlement) => ({ pluginId: entitlement.pluginId, status: entitlement.status, signedToken: entitlement.signedToken })) };
  }

  async authenticateControl(params: { installationId: string; ts: string; signature: string }, now = new Date()) {
    return this.authenticate(params, { installationId: params.installationId, ts: params.ts }, now, true);
  }

  /**
   * A school telling us it paid. The signature covers every field it sends, so nothing between the
   * school and here can change the amount, the reference, or the receipt it attached. A suspended
   * school is let through, as for the bill sync: it is exactly the school that needs to pay.
   */
  async authenticateSchoolPayment(params: { installationId: string; ts: string; signature: string }, body: Record<string, unknown>, now = new Date()) {
    return this.authenticate(params, schoolPaymentSignedPayload(params.installationId, params.ts, body), now, true);
  }

  async authorizeDownload(params: { installationId: string; sha256: string; pluginId: string; ts: string; signature: string }, now = new Date()) {
    const { registrationId } = await this.authenticate(params, { installationId: params.installationId, sha256: params.sha256, ts: params.ts }, now);
    const entitlement = await this.prisma.installationEntitlement.findUnique({ where: { installationId_pluginId: { installationId: registrationId, pluginId: params.pluginId } } });
    if (!entitlement || entitlement.status !== 'ACTIVE' || (entitlement.expiresAt && entitlement.expiresAt <= now) || (entitlement.updatesThrough && entitlement.updatesThrough < now)) {
      throw new HttpError(403, 'An active entitlement with update access is required');
    }
    return { registrationId };
  }

  private async authenticate(raw: { installationId: string; ts: string; signature: string }, payload: Record<string, unknown>, now: Date, allowInactiveSchool = false) {
    const input = requestInput.parse(raw);
    const tsMillis = Number(input.ts) * 1000;
    if (!Number.isFinite(tsMillis) || Math.abs(now.getTime() - tsMillis) > FRESHNESS_WINDOW_MS) throw new HttpError(401, 'Request timestamp is outside the freshness window');
    const registration = await this.prisma.installationRegistration.findUnique({
      where: { installationId: input.installationId },
      include: { keys: { where: { revokedAt: null } }, school: { select: { status: true } } },
    });
    const activeKey = registration?.keys[0];
    if (!registration || !activeKey) throw new HttpError(404, 'Installation is not registered');
    if (!allowInactiveSchool && registration.school && registration.school.status !== 'ACTIVE') throw new HttpError(403, 'Customer school is not active');
    const bytes = Buffer.from(canonicalJson(payload));
    let valid: boolean;
    try {
      valid = verify(null, bytes, activeKey.publicKeyPem, Buffer.from(input.signature, 'base64'));
    } catch {
      throw new HttpError(401, 'Signature could not be verified');
    }
    if (!valid) throw new HttpError(401, 'Signature is invalid');
    return { registrationId: registration.id };
  }

  /** Re-signs pre-generation schema-v1 rows on their first authenticated fetch. */
  private async upgradeLegacyToken(entitlement: { id: string; status: any; generation?: number; signedToken: any; expiresAt?: Date | null; updatesThrough?: Date | null; offlineUntil?: Date | null; [key: string]: any }, now: Date): Promise<any> {
    const payload = entitlement.signedToken?.payload;
    if (!this.config || Number.isSafeInteger(payload?.generation) && payload.generation > 0) return entitlement;
    if (!payload || typeof payload !== 'object') throw new HttpError(500, 'Stored entitlement token cannot be upgraded');
    const status = entitlement.status === 'ACTIVE' && entitlement.expiresAt && entitlement.expiresAt <= now ? 'EXPIRED' : entitlement.status;
    const terminal = status !== 'ACTIVE';
    const expiresAt = terminal ? new Date(now.getTime() + 10 * 365 * 86_400_000) : entitlement.expiresAt;
    const updatesThrough = terminal ? now : entitlement.updatesThrough;
    const offlineRecheckAfter = terminal ? new Date(now.getTime() + 30 * 86_400_000) : entitlement.offlineUntil;
    if (!expiresAt || !updatesThrough || !offlineRecheckAfter) throw new HttpError(500, 'Stored entitlement validity window cannot be upgraded');
    const token = issueEntitlement({
      generation: Math.max(1, entitlement.generation ?? 1), status: status as 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'REFUNDED',
      installationId: String(payload.installationId), customerId: String(payload.customerId), productId: String(payload.productId),
      licensedMajorRange: String(payload.licensedMajorRange), notBefore: terminal ? now.toISOString() : String(payload.notBefore), expiresAt: expiresAt.toISOString(),
      updatesThrough: updatesThrough.toISOString(), offlineRecheckAfter: offlineRecheckAfter.toISOString(),
      features: Array.isArray(payload.features) ? payload.features : [], issuer: String(payload.issuer),
    }, this.config.entitlementPrivateKey, this.config.entitlementKeyId, now);
    return this.prisma.installationEntitlement.update({ where: { id: entitlement.id }, data: {
      status, generation: token.payload.generation, tokenId: token.payload.tokenId,
      signedToken: token as unknown as Prisma.InputJsonValue,
    } });
  }
}

/**
 * The exact payload a school signs when it tells us it paid. It must stay identical to
 * schoolPaymentSignedPayload in backend/src/marketplace/school-payment-signing.ts, or every
 * submission fails verification -- scripts/school-payment-from-school-live-drill.js signs with the
 * school's code and verifies with this one to catch any drift.
 *
 * The receipt is covered by its SHA-256 rather than inline: that binds the image just as firmly
 * without canonicalising a couple of hundred kilobytes into the signed bytes. Every field signs as a
 * string, so the two apps' canonical-JSON implementations cannot disagree about nulls or numbers.
 */
export { schoolPaymentSignedPayload } from '@wattanam/marketplace-contracts';
