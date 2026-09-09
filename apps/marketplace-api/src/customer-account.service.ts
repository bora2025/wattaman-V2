import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';
import { maskEmail } from './platform-read-support';

const resetMfaInput = z.object({
  internalReason: z.string().trim().min(3).max(5000),
}).strict();

/**
 * Operator-side support actions on a marketplace customer account (`customers.manage`).
 *
 * The rule these actions are built around: an operator helps a customer regain access, and never
 * gains it themselves. A customer's approval is the only consent gate on letting a school
 * installation create paid orders in their name, so an operator who could produce that customer's
 * second factor could grant that consent to themselves and the approval would mean nothing.
 *
 * Nothing here therefore returns a password, a TOTP secret, or a recovery code, and nothing here
 * sets one. The operator clears the factor; the account owner enrols the replacement and is the
 * only party who ever sees it.
 */
export class CustomerAccountService {
  constructor(private readonly prisma: PrismaClient) {}

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
}

/** Support-visible second-factor state: enough to tell whether a customer is locked out, and
 * nothing that would help anyone sign in as them. */
export const MFA_STATUS_SELECT = {
  mfaEnabled: true,
  lockedUntil: true,
  _count: { select: { mfaRecoveryCodes: true } },
} as const;
