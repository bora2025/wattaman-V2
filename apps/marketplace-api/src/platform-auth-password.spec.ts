import { PlatformAuthService } from './platform-auth.service';
import { hashPassword, generateTotpSecret, totpCode } from './identity-crypto';
import { encryptSecret, parseSecretEncryptionKeys } from './secret-encryption';

const keys = parseSecretEncryptionKeys(JSON.stringify({ test: Buffer.alloc(32, 7).toString('base64') }), 'test');
const config = { identityEncryptionKeys: keys } as any;
const context = { correlationId: 'corr-1', ip: '10.0.0.1', userAgent: 'jest' };

const CURRENT = 'CurrentOperatorPass1';
const NEXT = 'ReplacementOperatorPass1';

function code(secret: string) {
  return totpCode(secret, Math.floor(Date.now() / 1000 / 30));
}

/** A transaction stub that records writes, so each test can assert on what was persisted rather
 * than only on the returned value — the audit row and the session revocation are the parts that
 * matter most and neither shows up in the response. */
async function harness(overrides: Partial<Record<string, unknown>> = {}) {
  const secret = generateTotpSecret();
  const operator = {
    id: 'operator-1',
    passwordHash: await hashPassword(CURRENT),
    mfaSecret: encryptSecret(secret, keys),
    mfaEnabled: true,
    failedLoginCount: 0,
    lockedUntil: null,
    status: 'ACTIVE',
    ...overrides,
  };
  const audit: any[] = [];
  const updates: any[] = [];
  const sessionUpdates: any[] = [];
  const tx = {
    platformOperator: {
      findUnique: jest.fn().mockResolvedValue(operator),
      update: jest.fn(async (args: any) => { updates.push(args); return operator; }),
    },
    platformOperatorSession: {
      updateMany: jest.fn(async (args: any) => { sessionUpdates.push(args); return { count: 3 }; }),
    },
    platformOperatorMfaRecoveryCode: { findUnique: jest.fn().mockResolvedValue(null) },
    platformAuditEvent: { create: jest.fn(async (args: any) => { audit.push(args.data); return args.data; }) },
  };
  const prisma = { $transaction: (callback: any) => callback(tx) } as any;
  const service = new PlatformAuthService(prisma, config);
  return { service, secret, operator, audit, updates, sessionUpdates, tx };
}

describe('PlatformAuthService.changePassword', () => {
  it('rotates the password and signs every other session out', async () => {
    const h = await harness();
    const result = await h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: code(h.secret),
    }, context);

    expect(result).toEqual({ changed: true, revokedSessions: 3 });
    expect(h.updates[0].data.passwordHash).toMatch(/^scrypt:/);
    expect(h.updates[0].data.passwordHash).not.toBe(h.operator.passwordHash);
    // The calling session is deliberately spared; it was just re-authenticated with both factors.
    expect(h.sessionUpdates[0].where).toMatchObject({ operatorId: 'operator-1', revokedAt: null, id: { not: 'session-1' } });
    expect(h.audit.at(-1)).toMatchObject({ action: 'platform_password_changed', success: true, correlationId: 'corr-1' });
  });

  it('never stores the new password in the clear', async () => {
    const h = await harness();
    await h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: code(h.secret),
    }, context);
    const written = JSON.stringify(h.updates) + JSON.stringify(h.audit);
    expect(written).not.toContain(NEXT);
    expect(written).not.toContain(CURRENT);
  });

  it('refuses a wrong current password, counts the failure, and audits it', async () => {
    const h = await harness();
    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: 'WrongCurrentPass1234', newPassword: NEXT, code: code(h.secret),
    }, context)).rejects.toMatchObject({ status: 401 });

    expect(h.updates[0].data.failedLoginCount).toBe(1);
    expect(h.audit.at(-1)).toMatchObject({ action: 'platform_password_change_failed', success: false, metadata: { reason: 'password' } });
  });

  it('refuses a valid password with a wrong second factor', async () => {
    const h = await harness();
    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: '000000',
    }, context)).rejects.toMatchObject({ status: 401 });

    expect(h.audit.at(-1)).toMatchObject({ action: 'platform_password_change_failed', metadata: { reason: 'mfa' } });
    expect(h.sessionUpdates).toHaveLength(0);
  });

  it('gives the same message whichever factor was wrong', async () => {
    const wrongPassword = await harness();
    const wrongCode = await harness();
    const first = await wrongPassword.service.changePassword('operator-1', 'session-1', {
      currentPassword: 'WrongCurrentPass1234', newPassword: NEXT, code: code(wrongPassword.secret),
    }, context).catch((error) => error.message);
    const second = await wrongCode.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: '000000',
    }, context).catch((error) => error.message);
    expect(first).toBe(second);
  });

  it('refuses to set the password to its current value', async () => {
    const h = await harness();
    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: CURRENT, code: code(h.secret),
    }, context)).rejects.toMatchObject({ status: 400 });
    expect(h.updates).toHaveLength(0);
  });

  it('rejects a new password below the bootstrap minimum before touching the database', async () => {
    const h = await harness();
    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: 'short', code: code(h.secret),
    }, context)).rejects.toBeDefined();
    expect(h.tx.platformOperator.findUnique).not.toHaveBeenCalled();
  });

  it('refuses while the account is locked out', async () => {
    const h = await harness({ lockedUntil: new Date(Date.now() + 60_000) });
    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: code(h.secret),
    }, context)).rejects.toMatchObject({ status: 423 });
    expect(h.audit.at(-1)).toMatchObject({ action: 'platform_password_change_locked' });
  });

  it('accepts an unused recovery code as the second factor and burns it', async () => {
    const h = await harness();
    const update = jest.fn().mockResolvedValue({});
    h.tx.platformOperatorMfaRecoveryCode.findUnique = jest.fn().mockResolvedValue({
      id: 'recovery-1', operatorId: 'operator-1', usedAt: null,
    });
    (h.tx.platformOperatorMfaRecoveryCode as any).update = update;

    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: 'abcdef0123',
    }, context)).resolves.toMatchObject({ changed: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'recovery-1' } }));
  });

  it('fails closed when a recovery code matches no row', async () => {
    const h = await harness();
    h.tx.platformOperatorMfaRecoveryCode.findUnique = jest.fn().mockResolvedValue(null);
    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: 'abcdef0123',
    }, context)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a recovery code belonging to a different operator', async () => {
    const h = await harness();
    h.tx.platformOperatorMfaRecoveryCode.findUnique = jest.fn().mockResolvedValue({
      id: 'recovery-9', operatorId: 'someone-else', usedAt: null,
    });
    await expect(h.service.changePassword('operator-1', 'session-1', {
      currentPassword: CURRENT, newPassword: NEXT, code: 'abcdef0123',
    }, context)).rejects.toMatchObject({ status: 401 });
  });
});
