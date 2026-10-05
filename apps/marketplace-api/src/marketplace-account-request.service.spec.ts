import { MarketplaceAccountRequestService } from './marketplace-account-request.service';

const context = { correlationId: 'corr-account-request', ip: '127.0.0.1', userAgent: 'jest' };

function prismaWith(tx: Record<string, any>) {
  return { $transaction: jest.fn(async (callback: any) => callback(tx)) } as any;
}

describe('MarketplaceAccountRequestService', () => {
  it('directs an existing owner to reuse their account for the new school claim', async () => {
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'account-1' }) },
      marketplaceAccountRequest: { findFirst: jest.fn(), create: jest.fn() },
    };
    await expect(new MarketplaceAccountRequestService(prismaWith(tx)).submit({
      email: 'owner@example.com', password: 'safe-password-123', displayName: 'School Owner', schoolName: 'Replacement School',
    })).rejects.toThrow('use the existing email, password, and MFA code with the new school enrollment token');
    expect(tx.marketplaceAccountRequest.create).not.toHaveBeenCalled();
  });

  it('stores a password hash and returns no credential when a request is submitted', async () => {
    const tx = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue(null) },
      marketplaceAccountRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'request-1', status: 'PENDING', createdAt: new Date() }),
      },
    };
    const result = await new MarketplaceAccountRequestService(prismaWith(tx)).submit({
      email: 'OWNER@EXAMPLE.COM', password: 'safe-password-123', displayName: 'School Owner', schoolName: 'Angkor School',
    });
    const data = tx.marketplaceAccountRequest.create.mock.calls[0][0].data;
    expect(data.email).toBe('owner@example.com');
    expect(data.passwordHash).not.toBe('safe-password-123');
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('approves exactly one pending request and audits the created account', async () => {
    const tx = {
      marketplaceAccountRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-1', status: 'PENDING', email: 'owner@example.com', displayName: 'Owner', passwordHash: 'hash' }),
        update: jest.fn().mockResolvedValue({ id: 'request-1', status: 'APPROVED', createdAccountId: 'account-1', reviewedAt: new Date() }),
      },
      marketplaceAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const result = await new MarketplaceAccountRequestService(prismaWith(tx)).decide(
      'request-1', 'operator-1', true, { internalReason: 'Customer identity checked.' }, context,
    );
    expect(result.status).toBe('APPROVED');
    expect(tx.marketplaceAccount.create).toHaveBeenCalledWith({ data: { email: 'owner@example.com', displayName: 'Owner', passwordHash: 'hash' }, select: { id: true } });
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.action).toBe('marketplace_account_request_approved');
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.metadata).toMatchObject({ reusedExistingAccount: false });
  });

  it('approves a request by reusing an existing account without replacing its credentials', async () => {
    const tx = {
      marketplaceAccountRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-2', status: 'PENDING', email: 'owner@example.com', displayName: 'Owner', passwordHash: 'untrusted-new-hash' }),
        update: jest.fn().mockResolvedValue({ id: 'request-2', status: 'APPROVED', createdAccountId: 'account-1', reviewedAt: new Date() }),
      },
      marketplaceAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'account-1' }),
        create: jest.fn(),
      },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const result = await new MarketplaceAccountRequestService(prismaWith(tx)).decide(
      'request-2', 'operator-1', true, { internalReason: 'Existing owner verified for another school.' }, context,
    );
    expect(result).toMatchObject({ status: 'APPROVED', createdAccountId: 'account-1' });
    expect(tx.marketplaceAccount.create).not.toHaveBeenCalled();
    expect(tx.marketplaceAccountRequest.update.mock.calls[0][0].data).toMatchObject({ createdAccountId: 'account-1', passwordHash: null });
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.metadata).toMatchObject({ accountId: 'account-1', reusedExistingAccount: true });
  });

  it('rejects without creating an account', async () => {
    const tx = {
      marketplaceAccountRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-1', status: 'PENDING', email: 'owner@example.com', displayName: 'Owner', passwordHash: 'hash' }),
        update: jest.fn().mockResolvedValue({ id: 'request-1', status: 'REJECTED', createdAccountId: null, reviewedAt: new Date() }),
      },
      marketplaceAccount: { findUnique: jest.fn(), create: jest.fn() },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const result = await new MarketplaceAccountRequestService(prismaWith(tx)).decide(
      'request-1', 'operator-1', false, { internalReason: 'Identity could not be confirmed.' }, context,
    );
    expect(result.status).toBe('REJECTED');
    expect(tx.marketplaceAccount.create).not.toHaveBeenCalled();
  });
});
