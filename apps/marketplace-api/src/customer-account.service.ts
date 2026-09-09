import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import { HttpError } from './http-error';
import { generateRecoveryCodes, generateTotpSecret, hashToken, totpUri } from './identity-crypto';
import { PlatformActionContext } from './platform-context';
import { maskEmail } from './platform-read-support';
import { encryptSecret } from './secret-encryption';

const resetMfaInput = z.object({
  internalReason: z.string().trim().min(3).max(5000),
}).strict();

const issueMfaInput = z.object({
  internalReason: z.string().trim().min(3).max(5000),
  /**
   * The operator retypes the address. This produces a working credential for someone else's
   * account rather than a reversible metadata change, so picking the wrong row from a list should
   * not be enough to do it.
   */
  confirmEmail: z.string().email().max(320),
}).strict();

/**
 * Operator-side support actions on a marketplace customer account (`customers.manage`).
 *
 * Two ways to restore a locked-out customer, with materially different trust:
 *
 * `resetMfa` clears the factor and returns nothing — the owner enrols the replacement and is the
 * only party who ever sees it. Prefer it whenever the owner can still sign in with their password.
 *
 * `issueMfa` mints the factor and hands it to the operator to pass on. It exists because the
 * customer portal has no enrolment screen and this deployment has no mail provider, so without it
 * an account with no working authenticator cannot be recovered at all. The cost is real and is not
 * mitigated by anything here: an operator who runs it can sign in as that customer, and so can
 * approve — in the customer's name — a school's permission to create paid orders. What the code
 * does provide is that this is never silent. It demands a reason and a retyped address, it ends
 * every existing session, and it records against both the operator and the customer that the
 * operator held this factor, so the possession is always visible after the fact.
 */
export class CustomerAccountService {
  constructor(private readonly prisma: PrismaClient, private readonly config?: MarketplaceConfig) {}

  /**
   * Clears an account's second factor so its owner can enrol a new one.
   *
   * Self-service MFA reset needs a working mail provider and an owner who can already sign in.
   * When neither holds — a lost authenticator on a marketplace with no mail configured — this is
   * the only way back in, and without it the account is permanently locked out.
   */
  async resetMfa(accountId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = resetMfaInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({
        where: { id: accountId },
        select: { id: true, email: true, displayName: true, mfaEnabled: true },
      });
      if (!account) throw new HttpError(404, 'Customer account not found');
      if (!account.mfaEnabled) throw new HttpError(409, 'This account has no second factor to reset');

      await tx.marketplaceAccount.update({
        where: { id: accountId },
        // Lockout counters are cleared too: an owner who lost their authenticator has usually been
        // failing sign-in, and leaving them locked would defeat the point of the reset.
        data: { mfaEnabled: false, mfaSecret: null, failedLoginCount: 0, lockedUntil: null },
      });
      // The old codes are a second factor in their own right, so they cannot outlive the secret.
      const codes = await tx.marketplaceMfaRecoveryCode.deleteMany({ where: { accountId } });
      // Any live session was authenticated with the factor being removed. Ending them is what makes
      // this a recovery rather than a way to leave someone else signed in as this customer.
      const sessions = await tx.marketplaceSession.updateMany({
        where: { accountId, revokedAt: null }, data: { revokedAt: now },
      });

      await tx.platformAuditEvent.create({
        data: {
          operatorId, action: 'customer_mfa_reset', success: true,
          targetType: 'MarketplaceAccount', targetId: accountId, reason: input.internalReason,
          metadata: { recoveryCodesDestroyed: codes.count, sessionsRevoked: sessions.count },
          correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
        },
      });
      // Recorded against the customer as well, so the reset appears in the account's own history
      // rather than only in a log the customer cannot see.
      await tx.marketplaceAuditEvent.create({
        data: { accountId, action: 'mfa_reset_by_operator', success: true, metadata: { operatorId } },
      });

      return {
        accountId,
        email: maskEmail(account.email),
        displayName: account.displayName,
        mfaEnabled: false,
        recoveryCodesDestroyed: codes.count,
        sessionsRevoked: sessions.count,
        nextStep: 'The account owner enrols a new authenticator at their next sign-in, and is the only person who sees the new secret and recovery codes.',
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Mints a second factor for a customer and returns it to the operator to pass on.
   *
   * Read the class comment before using this. It is the recovery of last resort — for an account
   * whose owner cannot enrol one themselves, on a deployment with no way to email them — and it
   * necessarily gives the operator the ability to sign in as that customer until the owner
   * replaces it.
   */
  async issueMfa(accountId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = issueMfaInput.parse(value);
    const keys = this.config?.identityEncryptionKeys ?? [];
    // Refused rather than downgraded: writing this secret in the clear would leave a permanent
    // credential readable to anyone who can read the database or a backup of it.
    if (keys.length === 0) throw new HttpError(503, 'Identity encryption is not configured; refusing to store a second factor unencrypted');

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({
        where: { id: accountId },
        select: { id: true, email: true, displayName: true },
      });
      if (!account) throw new HttpError(404, 'Customer account not found');
      if (account.email.toLowerCase() !== input.confirmEmail.trim().toLowerCase()) {
        throw new HttpError(400, 'The confirmation address does not match this account');
      }

      const secret = generateTotpSecret();
      const recoveryCodes = generateRecoveryCodes();
      await tx.marketplaceAccount.update({
        where: { id: accountId },
        data: {
          mfaSecret: encryptSecret(secret, keys), mfaEnabled: true,
          failedLoginCount: 0, lockedUntil: null,
        },
      });
      // Whatever the owner held before stops working, so the account has exactly one factor and it
      // is the one being handed over -- not two, one of which nobody can account for.
      await tx.marketplaceMfaRecoveryCode.deleteMany({ where: { accountId } });
      await tx.marketplaceMfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ accountId, codeHash: hashToken(code) })),
      });
      const sessions = await tx.marketplaceSession.updateMany({
        where: { accountId, revokedAt: null }, data: { revokedAt: now },
      });

      await tx.platformAuditEvent.create({
        data: {
          operatorId, action: 'customer_mfa_issued_by_operator', success: true,
          targetType: 'MarketplaceAccount', targetId: accountId, reason: input.internalReason,
          // Named plainly so an audit reader sees that an operator held this customer's factor,
          // which is the fact that matters when reviewing anything the account did afterwards.
          metadata: { operatorHeldFactor: true, sessionsRevoked: sessions.count },
          correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
        },
      });
      await tx.marketplaceAuditEvent.create({
        data: { accountId, action: 'mfa_issued_by_operator', success: true, metadata: { operatorId } },
      });

      return {
        accountId,
        email: maskEmail(account.email),
        displayName: account.displayName,
        secret,
        otpauthUri: totpUri(secret, account.email),
        recoveryCodes,
        sessionsRevoked: sessions.count,
        warning: 'Shown once. Send it to the account owner over a channel you trust, and ask them to replace it once they can — until they do, whoever has seen these values can sign in as this customer.',
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

/** Support-visible second-factor state: enough to tell whether a customer is locked out, and
 * nothing that would help anyone sign in as them. */
export const MFA_STATUS_SELECT = {
  mfaEnabled: true,
  lockedUntil: true,
  _count: { select: { mfaRecoveryCodes: true } },
} as const;
