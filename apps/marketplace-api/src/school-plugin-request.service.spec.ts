import { SchoolPluginRequestService } from './school-plugin-request.service';
import { generateKeyPairSync } from 'node:crypto';

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

  it('accepts customer information only from NEEDS_INFORMATION and reopens review atomically', async () => {
    const tx = {
      schoolPluginRequestMessage: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      schoolPluginRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-1', accountId: 'account-1', status: 'NEEDS_INFORMATION' }),
        update: jest.fn().mockResolvedValue({ id: 'request-1', status: 'UNDER_REVIEW' }),
      },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    const result = await new SchoolPluginRequestService(prisma).customerRespond('account-1', 'request-1', {
      idempotencyKey: 'customer-response-0001', body: 'The plugin will initially be used by 25 teachers.',
    });
    expect(result?.status).toBe('UNDER_REVIEW');
    expect(tx.schoolPluginRequestMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      visibility: 'CUSTOMER', accountAuthorId: 'account-1', idempotencyKey: 'customer-response-0001',
    }) });
    expect(tx.marketplaceAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'school_plugin_request_information_provided' }) });
  });

  it('allows the owner to cancel a non-terminal request and treats a retry as already complete', async () => {
    const tx = {
      schoolPluginRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-1', accountId: 'account-1', status: 'SUBMITTED' }),
        update: jest.fn().mockResolvedValue({ id: 'request-1', accountId: 'account-1', status: 'CANCELLED' }),
      },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await expect(new SchoolPluginRequestService(prisma).customerCancel('account-1', 'request-1', { reason: 'No longer required.' })).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(tx.marketplaceAuditEvent.create).toHaveBeenCalledTimes(1);
    tx.schoolPluginRequest.findUnique.mockResolvedValue({ id: 'request-1', accountId: 'account-1', status: 'CANCELLED' });
    await expect(new SchoolPluginRequestService(prisma).customerCancel('account-1', 'request-1', { reason: 'Retry cancellation.' })).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(tx.marketplaceAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('issues a signed 30-day trial entitlement and preserves local-install consent', async () => {
    const request = {
      id: 'request-1', accountId: 'account-1', installationId: 'registration-1', pluginId: 'plugin-1',
      status: 'APPROVED', type: 'TRIAL', orderId: null,
      installation: { id: 'registration-1', installationId: '11111111-1111-4111-8111-111111111111' },
      plugin: { id: 'plugin-1', isPaid: true, prices: [] },
    };
    const entitlement = { id: 'entitlement-1', status: 'ACTIVE' };
    const tx = {
      schoolPluginRequest: { findUnique: jest.fn().mockResolvedValue(request), update: jest.fn().mockResolvedValue({ ...request, status: 'ENTITLEMENT_ISSUED', entitlementId: entitlement.id }) },
      schoolPluginRequestDecision: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      installationEntitlement: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(entitlement) },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { schoolPluginRequest: { findUnique: jest.fn().mockResolvedValue(request) }, $transaction: jest.fn((work: any) => work(tx)) } as any;
    const privateKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const service = new SchoolPluginRequestService(prisma, { publicBaseUrl: 'https://marketplace.example', entitlementPrivateKey: privateKey, entitlementKeyId: 'entitlement-1' } as any, {} as any);
    const now = new Date('2026-09-02T00:00:00.000Z');
    await expect(service.fulfill('request-1', 'operator-1', {
      idempotencyKey: 'fulfill-request-0001', internalReason: 'Trial eligibility verified.', publicMessage: 'Your trial is ready.',
    }, { correlationId: 'corr-fulfill' }, now)).resolves.toMatchObject({ status: 'ENTITLEMENT_ISSUED' });
    const created = tx.installationEntitlement.create.mock.calls[0][0].data;
    expect(created.expiresAt).toEqual(new Date('2026-10-02T00:00:00.000Z'));
    expect(created.signedToken.payload.installationId).toBe(request.installation.installationId);
    expect(tx.schoolPluginRequestDecision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ conditions: expect.objectContaining({ validityDays: 30, localInstallationRequired: true }) }) });
  });

  it('creates an immutable purchase order but does not issue entitlement before settlement', async () => {
    const request = {
      id: 'request-2', accountId: 'account-1', installationId: 'registration-1', pluginId: 'plugin-1',
      status: 'APPROVED', type: 'PURCHASE_ASSISTANCE', orderId: null,
      installation: { id: 'registration-1', installationId: '11111111-1111-4111-8111-111111111111' },
      plugin: { id: 'plugin-1', isPaid: true, prices: [{ id: 'price-1', currency: 'USD', amountMinor: 2500 }] },
    };
    const tx = {
      schoolPluginRequest: { findUnique: jest.fn().mockResolvedValue(request), update: jest.fn().mockResolvedValue({ ...request, orderId: 'order-1' }) },
      schoolPluginRequestDecision: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const commerce = { createOrder: jest.fn().mockResolvedValue({ id: 'order-1', status: 'PENDING' }) };
    const prisma = { schoolPluginRequest: { findUnique: jest.fn().mockResolvedValue(request) }, $transaction: jest.fn((work: any) => work(tx)) } as any;
    await new SchoolPluginRequestService(prisma, {} as any, commerce as any).fulfill('request-2', 'operator-1', {
      idempotencyKey: 'purchase-request-0001', internalReason: 'Purchase eligibility verified.', currency: 'USD',
    }, { correlationId: 'corr-order' });
    expect(commerce.createOrder).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'plugin-request:request-2', priceIds: ['price-1'] }), expect.any(Date));
    expect(tx.schoolPluginRequest.update).toHaveBeenCalledWith({ where: { id: 'request-2' }, data: { orderId: 'order-1' } });
    expect(tx).not.toHaveProperty('installationEntitlement');
  });
});
