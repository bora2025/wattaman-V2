import { SchoolProvisioningService } from './school-provisioning.service';

const context = { correlationId: 'correlation-1', ip: '203.0.113.7', userAgent: 'jest' };

describe('SchoolProvisioningService', () => {
  it('requires a different operator to approve infrastructure creation', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      schoolProvisioningRequest: { findUnique: jest.fn().mockResolvedValue({ id: 'request-1', status: 'PENDING_APPROVAL', requestedByOperatorId: 'operator-1' }) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await expect(new SchoolProvisioningService(prisma).approve('request-1', 'operator-1', { internalReason: 'Reviewed request' }, context))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('different operator') });
  });

  it('returns an idempotent request only when the complete payload is identical', async () => {
    const input = {
      customerSchoolId: 'f97d2f57-f597-4f5e-a5ad-c89a919b264a', idempotencyKey: 'request-key-123',
      targetWorkspaceId: 'workspace-1', environment: 'production', releaseVersion: '1.0.0',
      apiImage: `api@sha256:${'a'.repeat(64)}`, webImage: `web@sha256:${'b'.repeat(64)}`,
      gatewayImage: `gateway@sha256:${'c'.repeat(64)}`, internalReason: 'New customer contract',
    };
    const existing = { id: 'request-1', requestedByOperatorId: 'operator-1', customerSchoolId: input.customerSchoolId };
    const prisma = { schoolProvisioningRequest: { findUnique: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce({ requestFingerprint: 'different' }) } } as any;
    await expect(new SchoolProvisioningService(prisma).create('operator-1', input, context))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('different provisioning request') });
  });

  it('returns an expired failed request to approval and clears stale approval', async () => {
    const updated = { id: 'request-1', status: 'PENDING_APPROVAL' };
    const tx = {
      $queryRaw: jest.fn(),
      schoolProvisioningRequest: {
        findUnique: jest.fn().mockResolvedValue({ status: 'FAILED_RETRYABLE', approvalExpiresAt: new Date('2026-01-01') }),
        update: jest.fn().mockResolvedValue(updated),
      },
      platformAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await expect(new SchoolProvisioningService(prisma).retry('request-1', 'operator-2', { internalReason: 'Retry after corrected configuration' }, context, new Date('2026-01-02'))).resolves.toBe(updated);
    expect(tx.schoolProvisioningRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL', approvedByOperatorId: null, approvalExpiresAt: null }) }));
  });
});
