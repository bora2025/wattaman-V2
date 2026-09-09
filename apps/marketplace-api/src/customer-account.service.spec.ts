import { CustomerAccountService } from './customer-account.service';

const context = { correlationId: 'correlation-1', ip: '203.0.113.7', userAgent: 'jest' };
const ACCOUNT = 'a080d904-268b-4736-9180-bcd74afa59ac';

function tx(account: Record<string, unknown> | null = { id: ACCOUNT, email: 'owner@example.com', displayName: 'Bora', mfaEnabled: true }) {
  return {
    marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(account), update: jest.fn().mockResolvedValue({}) },
    marketplaceMfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 8 }) },
    marketplaceSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
}

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
