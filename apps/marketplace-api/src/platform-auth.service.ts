import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import {
  generateRecoveryCodes, generateTotpSecret, hashToken, newOpaqueToken, totpUri, verifyPassword, verifyTotpCode,
} from './identity-crypto';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';
import { decryptSecret, encryptSecret } from './secret-encryption';

const DUMMY_PASSWORD_HASH = 'scrypt:16384:8:1:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const VERIFIED_SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
const ENROLLMENT_SESSION_LIFETIME_MS = 30 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;

const emailField = z.string().trim().toLowerCase().email().max(200);

const loginInput = z.object({
  email: emailField, password: z.string().min(1).max(200), code: z.string().min(6).max(20).optional(),
}).strict();

const sessionTokenInput = z.object({ sessionToken: z.string().min(32).max(500) }).strict();

const confirmMfaInput = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export class PlatformAuthService {
  constructor(private readonly prisma: PrismaClient, private readonly config: MarketplaceConfig) {}

  async login(value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = loginInput.parse(value);
    // Failure paths below record state (lockout counters, audit rows) that must survive the
    // request -- same reasoning as apps/marketplace-api/src/identity.service.ts#login: a Prisma
    // interactive transaction rolls back every write if its callback throws, so the callback
    // returns a result instead of throwing and the throw happens after commit.
    const result = await this.prisma.$transaction(async (tx) => {
      const operator = await tx.platformOperator.findUnique({ where: { email: input.email } });
      if (!operator) {
        await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
        return { ok: false as const, status: 401, message: 'Invalid email or password' };
      }
      if (operator.status === 'SUSPENDED') {
        await this.audit(tx, { operatorId: operator.id, action: 'platform_login_denied_suspended', success: false, ...context });
        return { ok: false as const, status: 403, message: 'This operator account is suspended' };
      }
      if (operator.lockedUntil && operator.lockedUntil > now) {
        await this.audit(tx, { operatorId: operator.id, action: 'platform_login_locked', success: false, ...context });
        return { ok: false as const, status: 423, message: 'Account is temporarily locked; try again later' };
      }
      const passwordValid = await verifyPassword(input.password, operator.passwordHash);
      if (!passwordValid) {
        await this.registerFailure(tx, operator.id, operator.failedLoginCount, now);
        await this.audit(tx, { operatorId: operator.id, action: 'platform_login_failed', success: false, ...context });
        return { ok: false as const, status: 401, message: 'Invalid email or password' };
      }
      if (!operator.mfaEnabled) {
        await tx.platformOperator.update({ where: { id: operator.id }, data: { failedLoginCount: 0, lockedUntil: null } });
        const session = await this.createSession(tx, operator.id, now, { mfaVerified: false, lifetimeMs: ENROLLMENT_SESSION_LIFETIME_MS });
        await this.audit(tx, { operatorId: operator.id, action: 'platform_login_mfa_enrollment_required', success: true, ...context });
        return { ok: true as const, value: { status: 'mfa_enrollment_required' as const, sessionToken: session.sessionToken, expiresAt: session.expiresAt } };
      }
      if (!input.code) return { ok: true as const, value: { status: 'mfa_required' as const } };
      const mfaValid = await this.verifyMfaFactor(tx, operator.id, operator.mfaSecret, input.code, now);
      if (!mfaValid) {
        await this.registerFailure(tx, operator.id, operator.failedLoginCount, now);
        await this.audit(tx, { operatorId: operator.id, action: 'platform_login_failed', success: false, metadata: { reason: 'mfa' }, ...context });
        return { ok: false as const, status: 401, message: 'Invalid email, password, or code' };
      }
      await tx.platformOperator.update({ where: { id: operator.id }, data: { failedLoginCount: 0, lockedUntil: null } });
      const session = await this.createSession(tx, operator.id, now, { mfaVerified: true, lifetimeMs: VERIFIED_SESSION_LIFETIME_MS });
      await this.audit(tx, { operatorId: operator.id, action: 'platform_login_succeeded', success: true, ...context });
      return { ok: true as const, value: { status: 'authenticated' as const, sessionToken: session.sessionToken, expiresAt: session.expiresAt } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.ok) throw new HttpError(result.status, result.message);
    return result.value;
  }

  async refreshSession(value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = sessionTokenInput.parse(value);
    const tokenHash = hashToken(input.sessionToken);
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.platformOperatorSession.findUnique({ where: { tokenHash } });
      if (!session) return { ok: false as const };
      if (session.revokedAt || session.expiresAt <= now) {
        await tx.platformOperatorSession.updateMany({ where: { operatorId: session.operatorId, revokedAt: null }, data: { revokedAt: now } });
        await this.audit(tx, { operatorId: session.operatorId, action: 'platform_session_reuse_detected', success: false, ...context });
        return { ok: false as const };
      }
      const lifetimeMs = session.mfaVerified ? VERIFIED_SESSION_LIFETIME_MS : ENROLLMENT_SESSION_LIFETIME_MS;
      const next = await this.createSession(tx, session.operatorId, now, { mfaVerified: session.mfaVerified, lifetimeMs });
      await tx.platformOperatorSession.update({ where: { id: session.id }, data: { revokedAt: now, replacedBySessionId: next.sessionId } });
      await this.audit(tx, { operatorId: session.operatorId, action: 'platform_session_refreshed', success: true, ...context });
      return { ok: true as const, value: { sessionToken: next.sessionToken, expiresAt: next.expiresAt } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.ok) throw new HttpError(401, 'Session is invalid');
    return result.value;
  }

  async revokeSession(value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = sessionTokenInput.parse(value);
    const tokenHash = hashToken(input.sessionToken);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.platformOperatorSession.findUnique({ where: { tokenHash } });
      if (!session || session.revokedAt) return { revoked: true };
      await tx.platformOperatorSession.update({ where: { id: session.id }, data: { revokedAt: now } });
      await this.audit(tx, { operatorId: session.operatorId, action: 'platform_session_revoked', success: true, ...context });
      return { revoked: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolveSession(rawToken: string, now = new Date()) {
    const session = await this.prisma.platformOperatorSession.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!session || session.revokedAt || session.expiresAt <= now) throw new HttpError(401, 'Session is invalid');
    const operator = await this.prisma.platformOperator.findUnique({ where: { id: session.operatorId } });
    if (!operator || operator.status === 'SUSPENDED') throw new HttpError(401, 'Session is invalid');
    return { operatorId: session.operatorId, sessionId: session.id, mfaVerified: session.mfaVerified };
  }

  async me(operatorId: string) {
    const operator = await this.prisma.platformOperator.findUnique({
      where: { id: operatorId }, select: { id: true, email: true, displayName: true, status: true, mfaEnabled: true, createdAt: true },
    });
    if (!operator) throw new HttpError(404, 'Operator not found');
    const permissions = await this.effectivePermissions(operatorId);
    const roles = await this.prisma.platformOperatorRole.findMany({
      where: { operatorId }, select: { role: { select: { key: true, displayName: true } } },
    });
    return { operator, roles: roles.map((entry) => entry.role), permissions: [...permissions].sort() };
  }

  async effectivePermissions(operatorId: string, now = new Date()): Promise<Set<string>> {
    const grants = await this.prisma.platformOperatorRole.findMany({
      where: { operatorId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
    });
    const permissions = new Set<string>();
    for (const grant of grants) for (const rolePermission of grant.role.permissions) permissions.add(rolePermission.permission.key);
    return permissions;
  }

  /** Step one of mandatory MFA enrollment -- callable only by an unverified (enrollment-scoped)
   * or verified session for the operator's own account, never on someone else's behalf. */
  async enrollMfa(operatorId: string, context: PlatformActionContext) {
    const secret = generateTotpSecret();
    return this.prisma.$transaction(async (tx) => {
      const operator = await tx.platformOperator.findUnique({ where: { id: operatorId }, select: { email: true, mfaEnabled: true } });
      if (!operator) throw new HttpError(404, 'Operator not found');
      if (operator.mfaEnabled) throw new HttpError(409, 'MFA is already enabled; disable it before re-enrolling');
      await tx.platformOperator.update({ where: { id: operatorId }, data: { mfaSecret: encryptSecret(secret, this.config.identityEncryptionKeys ?? []) } });
      await this.audit(tx, { operatorId, action: 'platform_mfa_enrolled', success: true, ...context });
      return { secret, otpauthUri: totpUri(secret, operator.email, 'Wattanam Platform Admin') };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** Step two: confirming enrollment both enables MFA and upgrades the calling session (if it was
   * the unverified enrollment session from login()) to a real, mfaVerified session in one step --
   * without this, the operator would need to log in a second time immediately after enrolling. */
  async confirmMfaEnrollment(operatorId: string, sessionId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = confirmMfaInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const operator = await tx.platformOperator.findUnique({ where: { id: operatorId }, select: { mfaSecret: true, mfaEnabled: true } });
      if (!operator?.mfaSecret || operator.mfaEnabled) throw new HttpError(409, 'No MFA enrollment is in progress');
      const secret = decryptSecret(operator.mfaSecret, this.config.identityEncryptionKeys ?? []);
      if (!verifyTotpCode(secret.plaintext, input.code, now)) throw new HttpError(400, 'MFA code is invalid');
      const codes = generateRecoveryCodes();
      await tx.platformOperator.update({ where: { id: operatorId }, data: { mfaEnabled: true } });
      await tx.platformOperatorMfaRecoveryCode.createMany({ data: codes.map((code) => ({ operatorId, codeHash: hashToken(code) })) });
      await tx.platformOperatorSession.update({ where: { id: sessionId }, data: { mfaVerified: true, expiresAt: new Date(now.getTime() + VERIFIED_SESSION_LIFETIME_MS) } });
      await this.audit(tx, { operatorId, action: 'platform_mfa_enabled', success: true, ...context });
      return { enabled: true, recoveryCodes: codes };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async verifyMfaFactor(tx: Prisma.TransactionClient, operatorId: string, secret: string | null, code: string, now: Date): Promise<boolean> {
    if (secret && /^\d{6}$/.test(code)) {
      const decrypted = decryptSecret(secret, this.config.identityEncryptionKeys ?? []);
      if (verifyTotpCode(decrypted.plaintext, code, now)) {
        if (decrypted.needsRotation) {
          await tx.platformOperator.update({ where: { id: operatorId }, data: { mfaSecret: encryptSecret(decrypted.plaintext, this.config.identityEncryptionKeys ?? []) } });
        }
        return true;
      }
    }
    const codeHash = hashToken(code);
    const recoveryCode = await tx.platformOperatorMfaRecoveryCode.findUnique({ where: { codeHash } });
    if (!recoveryCode || recoveryCode.operatorId !== operatorId || recoveryCode.usedAt) return false;
    await tx.platformOperatorMfaRecoveryCode.update({ where: { id: recoveryCode.id }, data: { usedAt: now } });
    return true;
  }

  private async registerFailure(tx: Prisma.TransactionClient, operatorId: string, currentFailures: number, now: Date) {
    const failedLoginCount = currentFailures + 1;
    const lockMinutes = failedLoginCount >= LOCKOUT_THRESHOLD ? Math.min(60, 2 ** (failedLoginCount - LOCKOUT_THRESHOLD)) : 0;
    await tx.platformOperator.update({
      where: { id: operatorId },
      data: { failedLoginCount, lockedUntil: lockMinutes > 0 ? new Date(now.getTime() + lockMinutes * 60_000) : undefined },
    });
  }

  private async createSession(tx: Prisma.TransactionClient, operatorId: string, now: Date, options: { mfaVerified: boolean; lifetimeMs: number }) {
    const token = newOpaqueToken();
    const expiresAt = new Date(now.getTime() + options.lifetimeMs);
    const session = await tx.platformOperatorSession.create({ data: { operatorId, tokenHash: token.hash, expiresAt, mfaVerified: options.mfaVerified } });
    return { sessionId: session.id, sessionToken: token.raw, expiresAt };
  }

  private async audit(tx: Prisma.TransactionClient, entry: { operatorId?: string; action: string; success: boolean; metadata?: Prisma.InputJsonValue; targetType?: string; targetId?: string; reason?: string; correlationId?: string; ip?: string; userAgent?: string }) {
    await tx.platformAuditEvent.create({ data: entry });
  }
}
