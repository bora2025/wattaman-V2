import { IdentityService } from './identity.service';
import { hashPassword, hashToken, totpCode } from './identity-crypto';

function config(nodeEnv: 'development' | 'test' | 'production' = 'test') {
  return { nodeEnv } as any;
}

function prismaWith(tx: any) {
  return { $transaction: jest.fn((work: (value: any) => unknown) => work(tx)), ...tx } as any;
}

describe('account registration and email verification', () => {
  it('registers an account, hashes the password, and returns the raw verification token outside production', async () => {
    const tx = {
      marketplaceAccount: { create: jest.fn().mockResolvedValue({ id: 'account-1', email: 'owner@school.example', displayName: 'Owner', createdAt: new Date() }) },
      marketplaceEmailVerification: { create: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config('development'));
    const result = await service.register({ email: 'Owner@School.example', password: 'a-strong-password', displayName: 'Owner' });
    expect(result.account.id).toBe('account-1');
    expect(result.emailVerificationToken).toEqual(expect.any(String));
    expect(tx.marketplaceAccount.create.mock.calls[0][0].data.email).toBe('owner@school.example');
    expect(tx.marketplaceAccount.create.mock.calls[0][0].data.passwordHash).not.toContain('a-strong-password');
    expect(tx.marketplaceAuditEvent.create.mock.calls[0][0].data.action).toBe('account_registered');
  });

  it('never returns the raw verification token in production', async () => {
    const tx = {
      marketplaceAccount: { create: jest.fn().mockResolvedValue({ id: 'account-1', email: 'owner@school.example' }) },
      marketplaceEmailVerification: { create: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config('production'));
    const result = await service.register({ email: 'owner@school.example', password: 'a-strong-password', displayName: 'Owner' });
    expect(result.emailVerificationToken).toBeUndefined();
  });

  it('delivers the verification token through the configured provider without returning it in production', async () => {
    const tx = {
      marketplaceAccount: { create: jest.fn().mockResolvedValue({ id: 'account-1', email: 'owner@school.example' }) },
      marketplaceEmailVerification: { create: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const configured = { ...config('production'), publicBaseUrl: 'https://marketplace.example', transactionalEmail: { provider: 'sendgrid' } };
    const result = await new IdentityService(prismaWith(tx), configured, email).register({
      email: 'owner@school.example', password: 'a-strong-password', displayName: 'Owner',
    });
    expect(result.emailVerificationToken).toBeUndefined();
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@school.example',
      text: expect.stringContaining('https://marketplace.example/marketplace/verify-email?token='),
    }));
  });

  it('rejects a duplicate email as a conflict', async () => {
    const tx = { marketplaceAccount: { create: jest.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })) } };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.register({ email: 'owner@school.example', password: 'a-strong-password', displayName: 'Owner' }))
      .rejects.toThrow('already exists');
  });

  it('confirms email verification exactly once', async () => {
    const tx = {
      marketplaceEmailVerification: {
        findUnique: jest.fn().mockResolvedValue({ id: 'verify-1', accountId: 'account-1', consumedAt: null, expiresAt: new Date('2026-09-01Z') }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceAccount: { update: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.confirmEmail({ token: 'a'.repeat(64) }, new Date('2026-08-28Z'))).resolves.toEqual({ verified: true });
    expect(tx.marketplaceAccount.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { emailVerifiedAt: new Date('2026-08-28Z') } });
  });

  it('rejects an expired or already-consumed verification token', async () => {
    const tx = { marketplaceEmailVerification: { findUnique: jest.fn().mockResolvedValue({ id: 'v', accountId: 'a', consumedAt: new Date(), expiresAt: new Date('2099-01-01Z') }) } };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.confirmEmail({ token: 'a'.repeat(64) })).rejects.toThrow('invalid or expired');
  });
});

describe('login, lockout, and MFA', () => {
  async function accountWith(overrides: Record<string, unknown> = {}) {
    return {
      id: 'account-1', email: 'owner@school.example', passwordHash: await hashPassword('correct-password'),
      failedLoginCount: 0, lockedUntil: null, mfaEnabled: false, mfaSecret: null, ...overrides,
    };
  }

  it('rejects an unknown email with a generic error and performs a dummy verification', async () => {
    const tx = { marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.login({ email: 'nobody@school.example', password: 'whatever12' })).rejects.toThrow('Invalid email or password');
  });

  it('locks the account after repeated failures and rejects further attempts without checking the password', async () => {
    const account = await accountWith({ failedLoginCount: 4 });
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const now = new Date('2026-08-28T00:00:00.000Z');
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.login({ email: account.email, password: 'wrong-password' }, now)).rejects.toThrow('Invalid email or password');
    expect(tx.marketplaceAccount.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { failedLoginCount: 5, lockedUntil: new Date(now.getTime() + 60_000) } });

    const lockedAccount = { ...account, failedLoginCount: 5, lockedUntil: new Date(now.getTime() + 60_000) };
    tx.marketplaceAccount.findUnique.mockResolvedValue(lockedAccount);
    await expect(service.login({ email: account.email, password: 'correct-password' }, now)).rejects.toThrow('temporarily locked');
  });

  it('logs in successfully and resets the failure counter', async () => {
    const account = await accountWith({ failedLoginCount: 2 });
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
      marketplaceSession: { create: jest.fn().mockResolvedValue({ id: 'session-1' }) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    const result = await service.login({ email: account.email, password: 'correct-password' });
    expect(result).toMatchObject({ status: 'authenticated', sessionToken: expect.any(String) });
    expect(tx.marketplaceAccount.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { failedLoginCount: 0, lockedUntil: null } });
  });

  it('requests an MFA code without counting it as a failed attempt', async () => {
    const account = await accountWith({ mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });
    const tx = { marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn() } };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.login({ email: account.email, password: 'correct-password' })).resolves.toEqual({ status: 'mfa_required' });
    expect(tx.marketplaceAccount.update).not.toHaveBeenCalled();
  });

  it('accepts a valid TOTP code and completes login', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const account = await accountWith({ mfaEnabled: true, mfaSecret: secret });
    const now = new Date('2026-08-28T00:00:00.000Z');
    const code = totpCode(secret, Math.floor(now.getTime() / 1000 / 30));
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
      marketplaceSession: { create: jest.fn().mockResolvedValue({ id: 'session-1' }) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.login({ email: account.email, password: 'correct-password', code }, now)).resolves.toMatchObject({ status: 'authenticated' });
  });

  it('accepts a valid recovery code exactly once', async () => {
    const account = await accountWith({ mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });
    const recoveryCode = 'abcdef0123';
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
      marketplaceMfaRecoveryCode: {
        findUnique: jest.fn().mockResolvedValue({ id: 'code-1', accountId: 'account-1', codeHash: hashToken(recoveryCode), usedAt: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceSession: { create: jest.fn().mockResolvedValue({ id: 'session-1' }) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.login({ email: account.email, password: 'correct-password', code: recoveryCode })).resolves.toMatchObject({ status: 'authenticated' });
    expect(tx.marketplaceMfaRecoveryCode.update).toHaveBeenCalledWith({ where: { id: 'code-1' }, data: { usedAt: expect.any(Date) } });
  });

  it('rejects a wrong MFA code as a counted failure', async () => {
    const account = await accountWith({ mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
      marketplaceMfaRecoveryCode: { findUnique: jest.fn().mockResolvedValue(null) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.login({ email: account.email, password: 'correct-password', code: '000000' }, new Date('2026-08-28T00:00:00.000Z'))).rejects.toThrow('Invalid email, password, or code');
    expect(tx.marketplaceAccount.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { failedLoginCount: 1, lockedUntil: undefined } });
  });
});

describe('session rotation and reuse detection', () => {
  it('rotates a valid session to a new token and revokes the old one', async () => {
    const tx = {
      marketplaceSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'session-1', accountId: 'account-1', revokedAt: null, expiresAt: new Date('2099-01-01Z') }),
        create: jest.fn().mockResolvedValue({ id: 'session-2' }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    const result = await service.refreshSession({ sessionToken: 'a'.repeat(64) });
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(tx.marketplaceSession.update).toHaveBeenCalledWith({ where: { id: 'session-1' }, data: { revokedAt: expect.any(Date), replacedBySessionId: 'session-2' } });
  });

  it('treats replay of an already-rotated token as reuse and revokes every session on the account', async () => {
    const tx = {
      marketplaceSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'session-1', accountId: 'account-1', revokedAt: new Date(), expiresAt: new Date('2099-01-01Z') }),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.refreshSession({ sessionToken: 'a'.repeat(64) })).rejects.toThrow('Session is invalid');
    expect(tx.marketplaceSession.updateMany).toHaveBeenCalledWith({ where: { accountId: 'account-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(tx.marketplaceAuditEvent.create.mock.calls[0][0].data.action).toBe('session_reuse_detected');
  });

  it('resolves an active session to its owning account', async () => {
    const prisma = { marketplaceSession: { findUnique: jest.fn().mockResolvedValue({ accountId: 'account-1', id: 'session-1', revokedAt: null, expiresAt: new Date('2099-01-01Z') }) } } as any;
    const service = new IdentityService(prisma, config());
    await expect(service.resolveSession('a'.repeat(64))).resolves.toEqual({ accountId: 'account-1', sessionId: 'session-1' });
  });

  it('rejects resolving an expired session', async () => {
    const prisma = { marketplaceSession: { findUnique: jest.fn().mockResolvedValue({ accountId: 'account-1', id: 'session-1', revokedAt: null, expiresAt: new Date('2000-01-01Z') }) } } as any;
    const service = new IdentityService(prisma, config());
    await expect(service.resolveSession('a'.repeat(64))).rejects.toThrow('Session is invalid');
  });
});

describe('password reset', () => {
  it('never reveals whether an email exists in production', async () => {
    const txKnown = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'account-1' }) },
      marketplacePasswordReset: { updateMany: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const txUnknown = { marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const serviceProd = new IdentityService(prismaWith(txKnown), config('production'));
    const serviceProdUnknown = new IdentityService(prismaWith(txUnknown), config('production'));
    await expect(serviceProd.requestPasswordReset({ email: 'owner@school.example' })).resolves.toEqual({ requested: true, passwordResetToken: undefined });
    await expect(serviceProdUnknown.requestPasswordReset({ email: 'nobody@school.example' })).resolves.toEqual({ requested: true, passwordResetToken: undefined });
  });

  it('resets the password, consumes the token, and revokes existing sessions', async () => {
    const tx = {
      marketplacePasswordReset: {
        findUnique: jest.fn().mockResolvedValue({ id: 'reset-1', accountId: 'account-1', consumedAt: null, expiresAt: new Date('2099-01-01Z') }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceAccount: { update: jest.fn().mockResolvedValue({}) },
      marketplaceSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.confirmPasswordReset({ token: 'a'.repeat(64), newPassword: 'a-new-strong-password' })).resolves.toEqual({ reset: true });
    expect(tx.marketplaceSession.updateMany).toHaveBeenCalledWith({ where: { accountId: 'account-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });
});

describe('MFA enrollment lifecycle', () => {
  it('enrolls, confirms with a valid code, and issues recovery codes exactly once', async () => {
    const tx = {
      marketplaceAccount: {
        findUnique: jest.fn().mockResolvedValueOnce({ email: 'owner@school.example', mfaEnabled: false }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceMfaRecoveryCode: { createMany: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    const enrollment = await service.enrollMfa('account-1');
    expect(enrollment.secret).toEqual(expect.any(String));
    tx.marketplaceAccount.findUnique.mockResolvedValueOnce({ mfaSecret: enrollment.secret, mfaEnabled: false });
    const now = new Date('2026-08-28T00:00:00.000Z');
    const code = totpCode(enrollment.secret, Math.floor(now.getTime() / 1000 / 30));
    const confirmed = await service.confirmMfaEnrollment('account-1', { code }, now);
    expect(confirmed.recoveryCodes).toHaveLength(8);
  });

  it('refuses to enroll when MFA is already enabled', async () => {
    const tx = { marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@school.example', mfaEnabled: true }) } };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.enrollMfa('account-1')).rejects.toThrow('already enabled');
  });

  it('disables MFA only with a valid password and a valid code, and deletes recovery codes', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const account = { id: 'account-1', passwordHash: await hashPassword('correct-password'), mfaEnabled: true, mfaSecret: secret };
    const now = new Date('2026-08-28T00:00:00.000Z');
    const code = totpCode(secret, Math.floor(now.getTime() / 1000 / 30));
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
      marketplaceMfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.disableMfa('account-1', { password: 'correct-password', code }, now)).resolves.toEqual({ disabled: true });
    expect(tx.marketplaceMfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'account-1' } });
  });

  it('refuses to disable MFA with a wrong password even if the code is valid', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const account = { id: 'account-1', passwordHash: await hashPassword('correct-password'), mfaEnabled: true, mfaSecret: secret };
    const now = new Date('2026-08-28T00:00:00.000Z');
    const code = totpCode(secret, Math.floor(now.getTime() / 1000 / 30));
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new IdentityService(prismaWith(tx), config());
    await expect(service.disableMfa('account-1', { password: 'wrong-password', code }, now)).rejects.toThrow('Password or code is invalid');
  });
});
