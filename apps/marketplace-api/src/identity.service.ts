import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import {
  generateRecoveryCodes, generateTotpSecret, hashPassword, hashToken, newOpaqueToken, totpUri, verifyPassword, verifyTotpCode,
} from './identity-crypto';
import { HttpError } from './http-error';
import { decryptSecret, encryptSecret } from './secret-encryption';
import { DisabledTransactionalEmailService, TransactionalEmailService } from './transactional-email.service';

const DUMMY_PASSWORD_HASH = 'scrypt:16384:8:1:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_LIFETIME_MS = 30 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;

const emailField = z.string().trim().toLowerCase().email().max(200);
const passwordField = z.string().min(10).max(200);

const registerInput = z.object({
  email: emailField, password: passwordField, displayName: z.string().trim().min(1).max(120),
}).strict();

const confirmEmailInput = z.object({ token: z.string().min(16).max(500) }).strict();

const loginInput = z.object({
  email: emailField, password: z.string().min(1).max(200), code: z.string().min(6).max(20).optional(),
}).strict();

const sessionTokenInput = z.object({ sessionToken: z.string().min(32).max(500) }).strict();

const requestResetInput = z.object({ email: emailField }).strict();

const confirmResetInput = z.object({ token: z.string().min(16).max(500), newPassword: passwordField }).strict();

const confirmMfaInput = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

const disableMfaInput = z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(20) }).strict();

export class IdentityService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: MarketplaceConfig,
    private readonly email: TransactionalEmailService = new DisabledTransactionalEmailService(),
  ) {}

  async register(value: unknown, now = new Date()) {
    const input = registerInput.parse(value);
    const passwordHash = await hashPassword(input.password);
    const verification = newOpaqueToken();
    try {
      const account = await this.prisma.$transaction(async (tx) => {
        const created = await tx.marketplaceAccount.create({
          data: { email: input.email, displayName: input.displayName, passwordHash },
          select: { id: true, email: true, displayName: true, createdAt: true },
        });
        await tx.marketplaceEmailVerification.create({
          data: { accountId: created.id, tokenHash: verification.hash, expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_LIFETIME_MS) },
        });
        await this.audit(tx, { accountId: created.id, action: 'account_registered', success: true });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (this.config.transactionalEmail?.provider === 'sendgrid') {
        const url = `${this.config.publicBaseUrl}/marketplace/verify-email?token=${encodeURIComponent(verification.raw)}`;
        await this.email.send({
          to: account.email,
          subject: 'Verify your Wattanam Marketplace account',
          text: `Verify your account: ${url}`,
          html: `<p>Verify your Wattanam Marketplace account:</p><p><a href="${url}">Verify email</a></p>`,
        });
      }
      return { account, emailVerificationToken: this.config.nodeEnv === 'production' ? undefined : verification.raw };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, 'An account with this email already exists');
      throw error;
    }
  }

  async confirmEmail(value: unknown, now = new Date()) {
    const input = confirmEmailInput.parse(value);
    const tokenHash = hashToken(input.token);
    return this.prisma.$transaction(async (tx) => {
      const verification = await tx.marketplaceEmailVerification.findUnique({ where: { tokenHash } });
      if (!verification || verification.consumedAt || verification.expiresAt <= now) throw new HttpError(400, 'Email verification token is invalid or expired');
      await tx.marketplaceEmailVerification.update({ where: { id: verification.id }, data: { consumedAt: now } });
      await tx.marketplaceAccount.update({ where: { id: verification.accountId }, data: { emailVerifiedAt: now } });
      await this.audit(tx, { accountId: verification.accountId, action: 'email_verified', success: true });
      return { verified: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async login(value: unknown, now = new Date()) {
    const input = loginInput.parse(value);
    // Failure paths below record state (lockout counters, audit rows) that must survive the
    // request: a Prisma interactive transaction rolls back every write it made if its callback
    // throws, so the callback returns a result instead of throwing and the throw happens after
    // the transaction has committed.
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({ where: { email: input.email } });
      if (!account) {
        await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
        return { ok: false as const, status: 401, message: 'Invalid email or password' };
      }
      if (account.lockedUntil && account.lockedUntil > now) {
        await this.audit(tx, { accountId: account.id, action: 'login_locked', success: false });
        return { ok: false as const, status: 423, message: 'Account is temporarily locked; try again later' };
      }
      const passwordValid = await verifyPassword(input.password, account.passwordHash);
      if (!passwordValid) {
        await this.registerFailure(tx, account.id, account.failedLoginCount, now);
        await this.audit(tx, { accountId: account.id, action: 'login_failed', success: false });
        return { ok: false as const, status: 401, message: 'Invalid email or password' };
      }
      if (account.mfaEnabled) {
        if (!input.code) return { ok: true as const, value: { status: 'mfa_required' as const } };
        const mfaValid = await this.verifyMfaFactor(tx, account.id, account.mfaSecret, input.code, now);
        if (!mfaValid) {
          await this.registerFailure(tx, account.id, account.failedLoginCount, now);
          await this.audit(tx, { accountId: account.id, action: 'login_failed', success: false, metadata: { reason: 'mfa' } });
          return { ok: false as const, status: 401, message: 'Invalid email, password, or code' };
        }
      }
      await tx.marketplaceAccount.update({ where: { id: account.id }, data: { failedLoginCount: 0, lockedUntil: null } });
      const session = await this.createSession(tx, account.id, now);
      await this.audit(tx, { accountId: account.id, action: 'login_succeeded', success: true });
      return { ok: true as const, value: { status: 'authenticated' as const, ...session } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.ok) throw new HttpError(result.status, result.message);
    return result.value;
  }

  async refreshSession(value: unknown, now = new Date()) {
    const input = sessionTokenInput.parse(value);
    const tokenHash = hashToken(input.sessionToken);
    // See login()'s comment: the reuse-detection branch's writes must survive even though the
    // request itself fails, so the callback returns a result instead of throwing.
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.marketplaceSession.findUnique({ where: { tokenHash } });
      if (!session) return { ok: false as const };
      if (session.revokedAt || session.expiresAt <= now) {
        await tx.marketplaceSession.updateMany({ where: { accountId: session.accountId, revokedAt: null }, data: { revokedAt: now } });
        await this.audit(tx, { accountId: session.accountId, action: 'session_reuse_detected', success: false });
        return { ok: false as const };
      }
      const next = await this.createSession(tx, session.accountId, now, { scope: session.scope, sourceGrantId: session.sourceGrantId ?? undefined });
      await tx.marketplaceSession.update({ where: { id: session.id }, data: { revokedAt: now, replacedBySessionId: next.sessionId } });
      await this.audit(tx, { accountId: session.accountId, action: 'session_refreshed', success: true });
      return { ok: true as const, value: { sessionToken: next.sessionToken, expiresAt: next.expiresAt } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.ok) throw new HttpError(401, 'Session is invalid');
    return result.value;
  }

  async revokeSession(value: unknown, now = new Date()) {
    const input = sessionTokenInput.parse(value);
    const tokenHash = hashToken(input.sessionToken);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.marketplaceSession.findUnique({ where: { tokenHash } });
      if (!session || session.revokedAt) return { revoked: true };
      await tx.marketplaceSession.update({ where: { id: session.id }, data: { revokedAt: now } });
      await this.audit(tx, { accountId: session.accountId, action: 'session_revoked', success: true });
      return { revoked: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolveSession(rawToken: string, now = new Date()) {
    const session = await this.prisma.marketplaceSession.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!session || session.revokedAt || session.expiresAt <= now) throw new HttpError(401, 'Session is invalid');
    return { accountId: session.accountId, sessionId: session.id, scope: session.scope, sourceGrantId: session.sourceGrantId ?? undefined };
  }

  async requestPasswordReset(value: unknown, now = new Date()) {
    const input = requestResetInput.parse(value);
    const token = newOpaqueToken();
    const rawToken = await this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({ where: { email: input.email }, select: { id: true, email: true } });
      if (!account) return undefined;
      await tx.marketplacePasswordReset.updateMany({ where: { accountId: account.id, consumedAt: null }, data: { consumedAt: now } });
      await tx.marketplacePasswordReset.create({
        data: { accountId: account.id, tokenHash: token.hash, expiresAt: new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS) },
      });
      await this.audit(tx, { accountId: account.id, action: 'password_reset_requested', success: true });
      return { raw: token.raw, email: account.email };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (rawToken && this.config.transactionalEmail?.provider === 'sendgrid') {
      const url = `${this.config.publicBaseUrl}/marketplace/reset-password?token=${encodeURIComponent(rawToken.raw)}`;
      await this.email.send({
        to: rawToken.email,
        subject: 'Reset your Wattanam Marketplace password',
        text: `Reset your password: ${url}`,
        html: `<p>A password reset was requested for your account.</p><p><a href="${url}">Reset password</a></p>`,
      });
    }
    return { requested: true, passwordResetToken: this.config.nodeEnv === 'production' ? undefined : rawToken?.raw };
  }

  async confirmPasswordReset(value: unknown, now = new Date()) {
    const input = confirmResetInput.parse(value);
    const tokenHash = hashToken(input.token);
    return this.prisma.$transaction(async (tx) => {
      const reset = await tx.marketplacePasswordReset.findUnique({ where: { tokenHash } });
      if (!reset || reset.consumedAt || reset.expiresAt <= now) throw new HttpError(400, 'Password reset token is invalid or expired');
      const passwordHash = await hashPassword(input.newPassword);
      await tx.marketplacePasswordReset.update({ where: { id: reset.id }, data: { consumedAt: now } });
      await tx.marketplaceAccount.update({ where: { id: reset.accountId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
      await tx.marketplaceSession.updateMany({ where: { accountId: reset.accountId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit(tx, { accountId: reset.accountId, action: 'password_reset_completed', success: true });
      return { reset: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async enrollMfa(accountId: string) {
    const secret = generateTotpSecret();
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({ where: { id: accountId }, select: { email: true, mfaEnabled: true } });
      if (!account) throw new HttpError(404, 'Account not found');
      if (account.mfaEnabled) throw new HttpError(409, 'MFA is already enabled; disable it before re-enrolling');
      await tx.marketplaceAccount.update({ where: { id: accountId }, data: { mfaSecret: encryptSecret(secret, this.config.identityEncryptionKeys ?? []) } });
      await this.audit(tx, { accountId, action: 'mfa_enrolled', success: true });
      return { secret, otpauthUri: totpUri(secret, account.email) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async confirmMfaEnrollment(accountId: string, value: unknown, now = new Date()) {
    const input = confirmMfaInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({ where: { id: accountId }, select: { mfaSecret: true, mfaEnabled: true } });
      if (!account?.mfaSecret || account.mfaEnabled) throw new HttpError(409, 'No MFA enrollment is in progress');
      const secret = decryptSecret(account.mfaSecret, this.config.identityEncryptionKeys ?? []);
      if (!verifyTotpCode(secret.plaintext, input.code, now)) throw new HttpError(400, 'MFA code is invalid');
      const codes = generateRecoveryCodes();
      await tx.marketplaceAccount.update({ where: { id: accountId }, data: { mfaEnabled: true } });
      await tx.marketplaceMfaRecoveryCode.createMany({ data: codes.map((code) => ({ accountId, codeHash: hashToken(code) })) });
      await this.audit(tx, { accountId, action: 'mfa_enabled', success: true });
      return { enabled: true, recoveryCodes: codes };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async disableMfa(accountId: string, value: unknown, now = new Date()) {
    const input = disableMfaInput.parse(value);
    // See login()'s comment: the failed-challenge audit row must survive even though the
    // request itself fails, so the callback returns a result instead of throwing.
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({ where: { id: accountId } });
      if (!account) return { ok: false as const, status: 404, message: 'Account not found' };
      if (!account.mfaEnabled) return { ok: false as const, status: 409, message: 'MFA is not enabled' };
      const passwordValid = await verifyPassword(input.password, account.passwordHash);
      const mfaValid = passwordValid && await this.verifyMfaFactor(tx, accountId, account.mfaSecret, input.code, now);
      if (!mfaValid) {
        await this.audit(tx, { accountId, action: 'mfa_challenge_failed', success: false });
        return { ok: false as const, status: 401, message: 'Password or code is invalid' };
      }
      await tx.marketplaceAccount.update({ where: { id: accountId }, data: { mfaEnabled: false, mfaSecret: null } });
      await tx.marketplaceMfaRecoveryCode.deleteMany({ where: { accountId } });
      await this.audit(tx, { accountId, action: 'mfa_disabled', success: true });
      return { ok: true as const, value: { disabled: true } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.ok) throw new HttpError(result.status, result.message);
    return result.value;
  }

  private async verifyMfaFactor(tx: Prisma.TransactionClient, accountId: string, secret: string | null, code: string, now: Date): Promise<boolean> {
    if (secret && /^\d{6}$/.test(code)) {
      const decrypted = decryptSecret(secret, this.config.identityEncryptionKeys ?? []);
      if (verifyTotpCode(decrypted.plaintext, code, now)) {
        if (decrypted.needsRotation) {
          await tx.marketplaceAccount.update({ where: { id: accountId }, data: { mfaSecret: encryptSecret(decrypted.plaintext, this.config.identityEncryptionKeys ?? []) } });
        }
        return true;
      }
    }
    const codeHash = hashToken(code);
    const recoveryCode = await tx.marketplaceMfaRecoveryCode.findUnique({ where: { codeHash } });
    if (!recoveryCode || recoveryCode.accountId !== accountId || recoveryCode.usedAt) return false;
    await tx.marketplaceMfaRecoveryCode.update({ where: { id: recoveryCode.id }, data: { usedAt: now } });
    return true;
  }

  private async registerFailure(tx: Prisma.TransactionClient, accountId: string, currentFailures: number, now: Date) {
    const failedLoginCount = currentFailures + 1;
    const lockMinutes = failedLoginCount >= LOCKOUT_THRESHOLD ? Math.min(60, 2 ** (failedLoginCount - LOCKOUT_THRESHOLD)) : 0;
    await tx.marketplaceAccount.update({
      where: { id: accountId },
      data: { failedLoginCount, lockedUntil: lockMinutes > 0 ? new Date(now.getTime() + lockMinutes * 60_000) : undefined },
    });
  }

  private async createSession(tx: Prisma.TransactionClient, accountId: string, now: Date, options: { scope?: string; sourceGrantId?: string } = {}) {
    const token = newOpaqueToken();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    const session = await tx.marketplaceSession.create({ data: { accountId, tokenHash: token.hash, expiresAt, scope: options.scope ?? 'FULL', sourceGrantId: options.sourceGrantId } });
    return { sessionId: session.id, sessionToken: token.raw, expiresAt };
  }

  private async audit(tx: Prisma.TransactionClient, entry: { accountId?: string; action: string; success: boolean; metadata?: Prisma.InputJsonValue; ip?: string; userAgent?: string }) {
    await tx.marketplaceAuditEvent.create({ data: entry });
  }
}
