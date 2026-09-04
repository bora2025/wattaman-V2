import { InstallationLinkService } from './installation-link.service';

const requestId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';

function tx(overrides: Record<string, any> = {}) {
  return {
    installationMarketplaceGrantRequest: {
      findUnique: jest.fn().mockResolvedValue({
        id: requestId, installationRegistrationId: 'registration-1', status: 'PENDING',
        requestedScope: 'COMMERCE_PROXY', expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    installationMarketplaceGrant: { upsert: jest.fn().mockResolvedValue({ id: 'grant-1' }) },
    installationRegistration: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function prismaWith(state: any) {
  return { $transaction: jest.fn((work: (value: any) => unknown) => work(state)) } as any;
}

describe('InstallationLinkService approval', () => {
  const now = new Date('2026-09-04T00:00:00.000Z');

  /**
   * A school enrolled with an operator's enrollment token registers with no account, because a
   * token says which school this is and nothing about who owns it. Consent is where ownership
   * attaches -- without it such a school could never place an order or raise a plugin request.
   */
  it('claims commercial ownership for a school that registered without an account', async () => {
    const state = tx();
    await new InstallationLinkService(prismaWith(state), {} as any).approve(requestId, accountId, now);

    expect(state.installationRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: 'registration-1', accountId: null },
      data: { accountId },
    });
    expect(state.marketplaceAuditEvent.create.mock.calls[0][0].data.metadata).toMatchObject({ ownershipClaimed: true });
  });

  it('never overwrites an existing owner, and says so in the audit row', async () => {
    // `updateMany` matching nothing is how the null-only guard reports "already owned".
    const state = tx({ installationRegistration: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } });
    await new InstallationLinkService(prismaWith(state), {} as any).approve(requestId, accountId, now);

    expect(state.installationRegistration.updateMany.mock.calls[0][0].where.accountId).toBeNull();
    expect(state.marketplaceAuditEvent.create.mock.calls[0][0].data.metadata).toMatchObject({ ownershipClaimed: false });
  });

  it('claims nothing when the request is denied', async () => {
    const state = tx();
    await new InstallationLinkService(prismaWith(state), {} as any).deny(requestId, accountId, now);

    expect(state.installationRegistration.updateMany).not.toHaveBeenCalled();
    expect(state.installationMarketplaceGrant.upsert).not.toHaveBeenCalled();
  });

  it('refuses to decide a request that is no longer pending', async () => {
    const state = tx({
      installationMarketplaceGrantRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: requestId, installationRegistrationId: 'registration-1', status: 'DELIVERED', expiresAt: new Date('2099-01-01T00:00:00.000Z') }),
        update: jest.fn(),
      },
    });
    await expect(new InstallationLinkService(prismaWith(state), {} as any).approve(requestId, accountId, now))
      .rejects.toMatchObject({ status: 409 });
    expect(state.installationRegistration.updateMany).not.toHaveBeenCalled();
  });

  it('expires a stale request instead of granting on it', async () => {
    const state = tx({
      installationMarketplaceGrantRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: requestId, installationRegistrationId: 'registration-1', status: 'PENDING', expiresAt: new Date('2026-09-03T00:00:00.000Z') }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    await expect(new InstallationLinkService(prismaWith(state), {} as any).approve(requestId, accountId, now))
      .rejects.toMatchObject({ status: 410 });
    expect(state.installationRegistration.updateMany).not.toHaveBeenCalled();
  });
});
