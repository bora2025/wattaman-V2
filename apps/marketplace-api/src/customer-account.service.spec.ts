import { CustomerAccountService } from './customer-account.service';

const context = { correlationId: 'correlation-1', ip: '203.0.113.7', userAgent: 'jest' };
const ACCOUNT = 'a080d904-268b-4736-9180-bcd74afa59ac';

function tx(account: Record<string, unknown> | null = { id: ACCOUNT, email: 'owner@example.com', displayName: 'Bora', mfaEnabled: true }) {
  return {
    marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
    marketplaceMfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 8 }), createMany: jest.fn().mockResolvedValue({ count: 8 }) },
    marketplaceSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
}

/** A real 32-byte key, because encryptSecret actually encrypts — a placeholder would not exercise it. */
const CONFIG = { identityEncryptionKeys: [{ keyId: 'k1', key: Buffer.alloc(32, 7) }] } as any;

function prismaWith(state: any) {
  return { $transaction: jest.fn((work: (value: any) => unknown) => work(state)) } as any;
}

describe('CustomerAccountService.resetMfa', () => {
  const now = new Date('2026-09-09T06:00:00.000Z');

  /**
   * The property the whole design rests on: an operator restores access without gaining it. If a
   * secret or a recovery code could leak out of here, an operator could sign in as the customer and
   * approve the link that lets a school create paid orders in that customer's name.
   */
  it('returns no secret, no recovery code, and no password', async () => {
    const state = tx();
    const result = await new CustomerAccountService(prismaWith(state)).resetMfa(ACCOUNT, 'operator-1', { internalReason: 'Owner lost authenticator.' }, context, now);

    // An exact key set rather than a word search: the response explains itself in prose, so
    // matching on words like "secret" flags the explanation instead of a leak. What matters is
    // that no field carrying credential material exists at all.
    expect(Object.keys(result).sort()).toEqual([
      'accountId', 'displayName', 'email', 'mfaEnabled', 'nextStep', 'recoveryCodesDestroyed', 'sessionsRevoked',
    ]);
    expect(result).toMatchObject({ mfaEnabled: false, recoveryCodesDestroyed: 8, sessionsRevoked: 2 });
    expect(result.email).toBe('o****@example.com');
  });

  it('clears the factor and the lockout that stranded the owner', async () => {
    const state = tx();
    await new CustomerAccountService(prismaWith(state)).resetMfa(ACCOUNT, 'operator-1', { internalReason: 'Owner lost authenticator.' }, context, now);

    expect(state.marketplaceAccount.update.mock.calls[0][0].data).toEqual({
      mfaEnabled: false, mfaSecret: null, failedLoginCount: 0, lockedUntil: null,
    });
  });

  it('destroys the recovery codes, which are a second factor in their own right', async () => {
    const state = tx();
    await new CustomerAccountService(prismaWith(state)).resetMfa(ACCOUNT, 'operator-1', { internalReason: 'Owner lost authenticator.' }, context, now);

    expect(state.marketplaceMfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { accountId: ACCOUNT } });
  });

  // Otherwise this would be a way to leave someone else signed in as the customer rather than a
  // recovery for the owner.
  it('ends every session that was authenticated with the removed factor', async () => {
    const state = tx();
    await new CustomerAccountService(prismaWith(state)).resetMfa(ACCOUNT, 'operator-1', { internalReason: 'Owner lost authenticator.' }, context, now);

    expect(state.marketplaceSession.updateMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT, revokedAt: null }, data: { revokedAt: now },
    });
  });

  it('records the reset against the operator and against the customer', async () => {
    const state = tx();
    await new CustomerAccountService(prismaWith(state)).resetMfa(ACCOUNT, 'operator-1', { internalReason: 'Owner lost authenticator, verified by phone.' }, context, now);

    expect(state.platformAuditEvent.create.mock.calls[0][0].data).toMatchObject({
      operatorId: 'operator-1', action: 'customer_mfa_reset', targetType: 'MarketplaceAccount',
      targetId: ACCOUNT, reason: 'Owner lost authenticator, verified by phone.', correlationId: 'correlation-1',
    });
    // Visible in the customer's own history, not only in a log they cannot see.
    expect(state.marketplaceAuditEvent.create.mock.calls[0][0].data).toMatchObject({
      accountId: ACCOUNT, action: 'mfa_reset_by_operator',
    });
  });

  it('refuses an account that has no second factor to reset', async () => {
    const state = tx({ id: ACCOUNT, email: 'owner@example.com', displayName: 'Bora', mfaEnabled: false });
    await expect(new CustomerAccountService(prismaWith(state)).resetMfa(ACCOUNT, 'operator-1', { internalReason: 'Nothing to do.' }, context, now))
      .rejects.toMatchObject({ status: 409 });
    expect(state.marketplaceAccount.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown account', async () => {
    const state = tx(null);
    await expect(new CustomerAccountService(prismaWith(state)).resetMfa(ACCOUNT, 'operator-1', { internalReason: 'Wrong id.' }, context, now))
      .rejects.toMatchObject({ status: 404 });
  });

  it('requires a reason, since the audit row is the only record of why access was restored', async () => {
    const prisma = { $transaction: jest.fn() } as any;
    await expect(new CustomerAccountService(prisma).resetMfa(ACCOUNT, 'operator-1', {}, context, now)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CustomerAccountService.resetPassword', () => {
  const now = new Date('2026-09-09T06:00:00.000Z');
  const input = { internalReason: 'Owner forgot password; no mail provider configured.', confirmEmail: 'owner@example.com' };

  function passwordTx(account: Record<string, unknown> | null = { id: ACCOUNT, email: 'owner@example.com', displayName: 'Bora', mfaEnabled: true }) {
    return { ...tx(account), marketplacePasswordReset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  }

  it('generates a strong password and stores only its hash', async () => {
    const state = passwordTx();
    const result = await new CustomerAccountService(prismaWith(state), CONFIG).resetPassword(ACCOUNT, 'operator-1', input, context, now);

    expect(result.password).toHaveLength(24);
    const stored = state.marketplaceAccount.update.mock.calls[0][0].data;
    // Never the plaintext: a database backup must not be a standing credential for this customer.
    expect(stored.passwordHash).not.toContain(result.password);
    expect(String(stored.passwordHash).length).toBeGreaterThan(0);
  });

  it('clears the lockout that usually accompanies a forgotten password', async () => {
    const state = passwordTx();
    await new CustomerAccountService(prismaWith(state), CONFIG).resetPassword(ACCOUNT, 'operator-1', input, context, now);

    expect(state.marketplaceAccount.update.mock.calls[0][0].data).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  });

  it('ends live sessions and consumes outstanding reset links', async () => {
    const state = passwordTx();
    await new CustomerAccountService(prismaWith(state), CONFIG).resetPassword(ACCOUNT, 'operator-1', input, context, now);

    expect(state.marketplaceSession.updateMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT, revokedAt: null }, data: { revokedAt: now },
    });
    // A link issued before this point would otherwise let its holder set a password afterwards.
    expect(state.marketplacePasswordReset.updateMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT, consumedAt: null }, data: { consumedAt: now },
    });
  });

  // With a second factor still in place, this password alone does not get anyone in, which changes
  // what a leak of it costs. The operator is told either way.
  it.each([[true], [false]])('reports whether a second factor still stands (mfaEnabled=%s)', async (mfaEnabled) => {
    const state = passwordTx({ id: ACCOUNT, email: 'owner@example.com', displayName: 'Bora', mfaEnabled });
    const result = await new CustomerAccountService(prismaWith(state), CONFIG).resetPassword(ACCOUNT, 'operator-1', input, context, now);

    expect(result.mfaStillRequired).toBe(mfaEnabled);
  });

  it('refuses when the retyped address does not match the account', async () => {
    const state = passwordTx();
    await expect(new CustomerAccountService(prismaWith(state), CONFIG)
      .resetPassword(ACCOUNT, 'operator-1', { ...input, confirmEmail: 'someone.else@example.com' }, context, now))
      .rejects.toMatchObject({ status: 400 });
    expect(state.marketplaceAccount.update).not.toHaveBeenCalled();
  });

  it('records plainly that an operator set this password', async () => {
    const state = passwordTx();
    await new CustomerAccountService(prismaWith(state), CONFIG).resetPassword(ACCOUNT, 'operator-1', input, context, now);

    expect(state.platformAuditEvent.create.mock.calls[0][0].data).toMatchObject({
      operatorId: 'operator-1', action: 'customer_password_reset_by_operator',
      targetId: ACCOUNT, metadata: { operatorSetPassword: true },
    });
    expect(state.marketplaceAuditEvent.create.mock.calls[0][0].data).toMatchObject({
      accountId: ACCOUNT, action: 'password_reset_by_operator',
    });
  });

  it('refuses an unknown account', async () => {
    const state = passwordTx(null);
    await expect(new CustomerAccountService(prismaWith(state), CONFIG).resetPassword(ACCOUNT, 'operator-1', input, context, now))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('CustomerAccountService.issueMfa', () => {
  const now = new Date('2026-09-09T06:00:00.000Z');
  const input = { internalReason: 'Owner cannot enrol; no portal screen exists.', confirmEmail: 'owner@example.com' };

  it('returns a usable factor and stores only its encrypted form', async () => {
    const state = tx();
    const result = await new CustomerAccountService(prismaWith(state), CONFIG).issueMfa(ACCOUNT, 'operator-1', input, context, now);

    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(result.recoveryCodes).toHaveLength(8);
    expect(result.otpauthUri).toContain(result.secret);

    const stored = state.marketplaceAccount.update.mock.calls[0][0].data;
    expect(stored.mfaEnabled).toBe(true);
    // The plaintext must never be what lands in the row, or a database backup is a standing
    // credential for this customer.
    expect(stored.mfaSecret).not.toContain(result.secret);
    expect(String(stored.mfaSecret).length).toBeGreaterThan(0);
  });

  it('stores recovery codes only as hashes', async () => {
    const state = tx();
    const result = await new CustomerAccountService(prismaWith(state), CONFIG).issueMfa(ACCOUNT, 'operator-1', input, context, now);

    const written = JSON.stringify(state.marketplaceMfaRecoveryCode.createMany.mock.calls[0][0].data);
    for (const code of result.recoveryCodes) expect(written).not.toContain(code);
  });

  // Picking the wrong row from a list must not be enough to mint someone else's credential.
  it('refuses when the retyped address does not match the account', async () => {
    const state = tx();
    await expect(new CustomerAccountService(prismaWith(state), CONFIG)
      .issueMfa(ACCOUNT, 'operator-1', { ...input, confirmEmail: 'someone.else@example.com' }, context, now))
      .rejects.toMatchObject({ status: 400 });
    expect(state.marketplaceAccount.update).not.toHaveBeenCalled();
  });

  it('refuses rather than storing the secret unencrypted when identity encryption is unconfigured', async () => {
    const state = tx();
    await expect(new CustomerAccountService(prismaWith(state), { identityEncryptionKeys: [] } as any)
      .issueMfa(ACCOUNT, 'operator-1', input, context, now)).rejects.toMatchObject({ status: 503 });
    expect(state.marketplaceAccount.update).not.toHaveBeenCalled();
  });

  it('replaces the previous factor entirely and ends every session', async () => {
    const state = tx();
    await new CustomerAccountService(prismaWith(state), CONFIG).issueMfa(ACCOUNT, 'operator-1', input, context, now);

    // Old codes gone before new ones are written: the account ends with exactly one factor, the
    // one being handed over.
    expect(state.marketplaceMfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { accountId: ACCOUNT } });
    expect(state.marketplaceSession.updateMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT, revokedAt: null }, data: { revokedAt: now },
    });
  });

  /** The compensating control for a capability that cannot otherwise be made safe: whoever reviews
   * this account's activity later can see that an operator held its factor. */
  it('records plainly that an operator held this customer factor', async () => {
    const state = tx();
    await new CustomerAccountService(prismaWith(state), CONFIG).issueMfa(ACCOUNT, 'operator-1', input, context, now);

    expect(state.platformAuditEvent.create.mock.calls[0][0].data).toMatchObject({
      operatorId: 'operator-1', action: 'customer_mfa_issued_by_operator',
      targetId: ACCOUNT, metadata: { operatorHeldFactor: true },
    });
    expect(state.marketplaceAuditEvent.create.mock.calls[0][0].data).toMatchObject({
      accountId: ACCOUNT, action: 'mfa_issued_by_operator',
    });
  });

  it('refuses an unknown account', async () => {
    const state = tx(null);
    await expect(new CustomerAccountService(prismaWith(state), CONFIG).issueMfa(ACCOUNT, 'operator-1', input, context, now))
      .rejects.toMatchObject({ status: 404 });
  });

  it('requires both a reason and a confirmation address', async () => {
    const prisma = { $transaction: jest.fn() } as any;
    const service = new CustomerAccountService(prisma, CONFIG);
    await expect(service.issueMfa(ACCOUNT, 'operator-1', { internalReason: 'No confirmation.' }, context, now)).rejects.toThrow();
    await expect(service.issueMfa(ACCOUNT, 'operator-1', { confirmEmail: 'owner@example.com' }, context, now)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
