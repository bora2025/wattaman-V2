import { SchoolPluginRequestService } from './school-plugin-request.service';

describe('SchoolPluginRequestService', () => {
  it('creates a school-owned request with the approved business-day SLA', async () => {
    const created = { id: 'request-1', type: 'FREE_APPROVAL', status: 'SUBMITTED' };
    const prisma = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com', emailVerifiedAt: new Date() }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', accountId: 'account-1' }) },
      marketplacePlugin: { findUnique: jest.fn().mockResolvedValue({ id: 'plugin-1', status: 'APPROVED' }) },
      schoolPluginRequest: { create: jest.fn().mockResolvedValue(created) },
    } as any;
    const now = new Date('2026-08-28T09:00:00.000Z'); // Friday; two business days ends Tuesday.
    await expect(new SchoolPluginRequestService(prisma).create('account-1', {
      installationId: '11111111-1111-4111-8111-111111111111', pluginId: 'plugin-1',
      type: 'FREE_APPROVAL', justification: 'Needed for the school communication workflow.',
    }, now)).resolves.toBe(created);
    expect(prisma.schoolPluginRequest.create.mock.calls[0][0].data).toMatchObject({
      accountId: 'account-1', installationId: 'registration-1', contactEmail: 'owner@example.com',
      slaDueAt: new Date('2026-09-01T09:00:00.000Z'),
    });
  });

  it('rejects a request for an installation owned by another account', async () => {
    const prisma = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com', emailVerifiedAt: new Date() }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', accountId: 'other-account' }) },
      marketplacePlugin: { findUnique: jest.fn().mockResolvedValue({ id: 'plugin-1', status: 'APPROVED' }) },
    } as any;
    await expect(new SchoolPluginRequestService(prisma).create('account-1', {
      installationId: '11111111-1111-4111-8111-111111111111', pluginId: 'plugin-1',
      type: 'TRIAL', justification: 'Evaluate this plugin with the teaching team.',
    })).rejects.toMatchObject({ status: 403 });
  });

  it('enforces the one-trial-per-installation/plugin/year policy', async () => {
    const prisma = {
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com', emailVerifiedAt: new Date() }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', accountId: 'account-1' }) },
      marketplacePlugin: { findUnique: jest.fn().mockResolvedValue({ id: 'plugin-1', status: 'APPROVED' }) },
      schoolPluginRequest: { findFirst: jest.fn().mockResolvedValue({ id: 'previous-trial' }) },
    } as any;
    await expect(new SchoolPluginRequestService(prisma).create('account-1', {
      installationId: '11111111-1111-4111-8111-111111111111', pluginId: 'plugin-1',
      type: 'TRIAL', justification: 'Evaluate this plugin with the teaching team.',
    })).rejects.toMatchObject({ status: 409 });
  });

  it('records an approval, immutable decision, and operator audit atomically', async () => {
    const tx = {
      schoolPluginRequestDecision: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      schoolPluginRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-1', status: 'UNDER_REVIEW' }),
        update: jest.fn().mockResolvedValue({ id: 'request-1', status: 'APPROVED' }),
      },
      schoolPluginRequestMessage: { create: jest.fn() },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    const result = await new SchoolPluginRequestService(prisma).approve('request-1', 'operator-1', {
      idempotencyKey: 'approval-key-0001', internalReason: 'Eligibility and ownership verified.', publicMessage: 'Approved.',
    }, { correlationId: 'correlation-1' }, new Date('2026-08-31T12:00:00.000Z'));
    expect(result?.status).toBe('APPROVED');
    expect(tx.schoolPluginRequestDecision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      decision: 'APPROVED', operatorId: 'operator-1', conditions: { trialDays: 30, entitlementIssued: false, localInstallationRequired: true },
    }) });
    expect(tx.platformAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'school_plugin_request_approved', correlationId: 'correlation-1' }) });
  });

  it('never returns internal decision reasons in the customer timeline query', async () => {
    const prisma = { schoolPluginRequest: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await new SchoolPluginRequestService(prisma).customerRequests('account-1');
    const decisionSelect = prisma.schoolPluginRequest.findMany.mock.calls[0][0].select.decisions.select;
    expect(decisionSelect).toHaveProperty('publicMessage', true);
    expect(decisionSelect).not.toHaveProperty('internalReason');
    expect(prisma.schoolPluginRequest.findMany.mock.calls[0][0].select.messages.where).toEqual({ visibility: 'CUSTOMER' });
  });
});
