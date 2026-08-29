import { PublisherGovernanceService } from './publisher-governance.service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function serviceWith(prisma: any) {
  prisma.$transaction ||= jest.fn(async (value: any) => typeof value === 'function' ? value(prisma) : Promise.all(value));
  return new PublisherGovernanceService(prisma, {} as any);
}

describe('PublisherGovernanceService', () => {
  it('requires two different reviewers before publisher identity becomes verified', async () => {
    const approvals: any[] = [];
    const prisma: any = {
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer-role' }) },
      marketplaceAuditEvent: {
        findMany: jest.fn(async () => approvals),
        create: jest.fn(async ({ data }: any) => { const row = { id: `audit-${approvals.length}`, ...data }; approvals.push(row); return row; }),
      },
      publisher: { update: jest.fn().mockResolvedValue({ status: 'VERIFIED' }) },
    };
    const service = serviceWith(prisma);
    await expect(service.approvePublisher({ publisherId: id(1), approvedBy: id(2) })).resolves.toMatchObject({ approvalCount: 1, verified: false });
    await expect(service.approvePublisher({ publisherId: id(1), approvedBy: id(3) })).resolves.toMatchObject({ approvalCount: 2, verified: true });
    expect(prisma.publisher.update).toHaveBeenCalledTimes(1);
  });

  it('rejects self-approval of a publisher signing key', async () => {
    const prisma: any = { publisherKey: { findUnique: jest.fn().mockResolvedValue({ id: id(4), publisherId: id(1), enrolledBy: id(2), keyId: 'key-1' }) } };
    await expect(serviceWith(prisma).approveKey({ keyRecordId: id(4), approvedBy: id(2) })).rejects.toThrow('requires a second person');
  });

  it('requires two independent approvals for a risky submission', async () => {
    const firstReview = { id: 'review-1', submissionId: id(5), reviewerId: id(2), decision: 'APPROVE', notes: 'one', evidence: {} };
    const submission = { id: id(5), status: 'NEEDS_REVIEW', riskLevel: 'HIGH', submittedBy: id(1), pluginVersionId: id(6), reviews: [], pluginVersion: { pluginId: 'vendor.plugin' } };
    const prisma: any = {
      pluginSubmission: { findUnique: jest.fn().mockResolvedValueOnce(submission).mockResolvedValueOnce({ ...submission, reviews: [firstReview] }), update: jest.fn() },
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer' }) },
      submissionReview: { create: jest.fn().mockResolvedValueOnce(firstReview).mockResolvedValueOnce({ ...firstReview, id: 'review-2', reviewerId: id(3) }) },
      pluginVersion: { update: jest.fn() }, marketplacePlugin: { update: jest.fn() },
    };
    const service = serviceWith(prisma);
    await expect(service.review({ submissionId: id(5), reviewerId: id(2), decision: 'APPROVE', notes: 'Static and migration review passed', evidence: { run: 'one' } })).resolves.toMatchObject({ requiredApprovals: 2, approved: false });
    await expect(service.review({ submissionId: id(5), reviewerId: id(3), decision: 'APPROVE', notes: 'Independent reproduction passed', evidence: { run: 'two' } })).resolves.toMatchObject({ requiredApprovals: 2, approved: true });
    expect(prisma.pluginVersion.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewStatus: 'APPROVED' }) }));
  });

  it('records exact sale allocations idempotently in integer minor units', async () => {
    const upsert = jest.fn(async ({ create }: any) => create);
    const prisma: any = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue({ id: id(7), status: 'PAID', currency: 'USD', lines: [{ id: id(8), unitPriceMinor: 1000, plugin: { publisherId: id(1) } }, { id: id(9), unitPriceMinor: 333, plugin: { publisherId: id(1) } }] }) },
      publisherRevenueEntry: { upsert },
    };
    const entries: any = await serviceWith(prisma).recordOrderRevenue(id(7), 1500);
    expect(entries.map((entry: any) => [entry.grossMinor, entry.feeMinor, entry.netMinor])).toEqual([[1000, 150, 850], [333, 49, 284]]);
    expect(entries.every((entry: any) => entry.grossMinor - entry.feeMinor - entry.taxMinor === entry.netMinor)).toBe(true);
  });

  it('requires separate creator and approver for append-only corrections', async () => {
    const prisma: any = {};
    await expect(serviceWith(prisma).correctEntry({ entryId: id(1), grossMinor: 10, feeMinor: 0, taxMinor: 0, description: 'Correction', createdBy: id(2), approvedBy: id(2) })).rejects.toThrow('dual approval');
  });

  it('generates a statement whose totals equal its immutable source entries', async () => {
    const entries = [
      { id: id(1), grossMinor: 1000, feeMinor: 150, taxMinor: 50, netMinor: 800 },
      { id: id(2), grossMinor: -200, feeMinor: -30, taxMinor: -10, netMinor: -160 },
    ];
    const prisma: any = {
      publisherRevenueEntry: { findMany: jest.fn().mockResolvedValue(entries) },
      publisherStatement: { create: jest.fn(async ({ data }: any) => ({ id: id(3), ...data })) },
    };
    const result: any = await serviceWith(prisma).generateStatement({ publisherId: id(4), currency: 'USD', periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-09-01T00:00:00.000Z' });
    expect(result).toMatchObject({ grossMinor: 800, feeMinor: 120, taxMinor: 40, netMinor: 640 });
    expect(result.grossMinor - result.feeMinor - result.taxMinor).toBe(result.netMinor);
  });

  it('reconciles payout amount to selected statement entries and prevents self-approval', async () => {
    const prisma: any = {
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'finance-role' }) },
      publisherRevenueEntry: { findMany: jest.fn().mockResolvedValue([{ id: id(1), netMinor: 800 }, { id: id(2), netMinor: -160 }]) },
      publisherPayout: {
        create: jest.fn(async ({ data }: any) => ({ id: id(5), status: 'PENDING_APPROVAL', ...data })),
        findUnique: jest.fn().mockResolvedValue({ id: id(5), publisherId: id(4), status: 'PENDING_APPROVAL', requestedBy: id(6) }),
      },
    };
    const service = serviceWith(prisma);
    await expect(service.requestPayout({ publisherId: id(4), currency: 'USD', entryIds: [id(1), id(2)], requestedBy: id(6) })).resolves.toMatchObject({ amountMinor: 640 });
    await expect(service.approvePayout({ payoutId: id(5), approvedBy: id(6) })).rejects.toThrow('requires a second person');
  });

  it('fails the launch assessment closed until real pilot outcomes exist', async () => {
    const prisma: any = {
      publisher: { count: jest.fn().mockResolvedValue(0) }, pluginSubmission: { findMany: jest.fn().mockResolvedValue([]) },
      submissionReview: { count: jest.fn().mockResolvedValue(0) }, pluginVersion: { count: jest.fn().mockResolvedValue(0) },
      marketplaceAuditEvent: { count: jest.fn().mockResolvedValue(0) }, publisherStatement: { count: jest.fn().mockResolvedValue(0) }, publisherPayout: { count: jest.fn().mockResolvedValue(0) },
    };
    await expect(serviceWith(prisma).launchAssessment()).resolves.toMatchObject({ decision: 'NO_GO', blockers: expect.arrayContaining([expect.stringContaining('3 invited'), expect.stringContaining('5 pilot')]) });
  });
});
