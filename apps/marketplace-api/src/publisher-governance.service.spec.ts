import { PublisherGovernanceService } from './publisher-governance.service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function serviceWith(prisma: any) {
  prisma.$transaction ||= jest.fn(async (value: any) => typeof value === 'function' ? value(prisma) : Promise.all(value));
  return new PublisherGovernanceService(prisma, {} as any);
}

describe('PublisherGovernanceService', () => {
  it('lists only publishers where the current account is a verified active member', async () => {
    const prisma: any = {
      publisher: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: id(1), slug: 'acme', displayName: 'Acme Plugins', status: 'VERIFIED', createdAt: new Date('2026-01-01T00:00:00.000Z'),
            members: [{ role: 'OWNER', verifiedAt: new Date('2026-01-01T00:00:00.000Z'), suspendedAt: null }],
            _count: { plugins: 2, keys: 1, submissions: 3, members: 2 },
          },
        ]),
      },
    };
    const result: any = await serviceWith(prisma).myPublishers(id(10), { limit: '20' });
    expect(prisma.publisher.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { members: { some: { accountId: id(10), verifiedAt: { not: null }, suspendedAt: null } } } }));
    expect(result.items[0]).toMatchObject({ id: id(1), slug: 'acme', myRoles: ['OWNER'] });
    expect(result.nextCursor).toBeNull();
  });

  it('lists only submissions visible to the current publisher member', async () => {
    const prisma: any = {
      pluginSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: id(20), publisherId: id(1), status: 'NEEDS_REVIEW', riskLevel: 'HIGH', submittedAt: new Date('2026-09-01T00:00:00.000Z'), decidedAt: null,
            publisher: { id: id(1), slug: 'acme', displayName: 'Acme Plugins' },
            pluginVersion: { id: id(30), pluginId: 'acme.plugin', version: '0.1.0', channel: 'BETA', reviewStatus: 'IN_REVIEW', publishedAt: null, withdrawnAt: null },
            _count: { reviews: 1 },
          },
        ]),
      },
    };
    const result: any = await serviceWith(prisma).mySubmissions(id(10), { publisherId: id(1), status: 'NEEDS_REVIEW', limit: '20' });
    expect(prisma.pluginSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ publisherId: id(1), status: 'NEEDS_REVIEW', publisher: { members: { some: { accountId: id(10), verifiedAt: { not: null }, suspendedAt: null } } } }) }));
    expect(result.items[0]).toMatchObject({ id: id(20), status: 'NEEDS_REVIEW' });
    expect(result.nextCursor).toBeNull();
  });

  it('adds a verified publisher member when verifier role and MFA requirements are satisfied', async () => {
    const prisma: any = {
      publisherMember: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'owner-role' })
          .mockResolvedValueOnce({ id: 'new-member', role: 'SUPPORT', verifiedAt: new Date() }),
        create: jest.fn().mockResolvedValue({ id: 'new-member', role: 'SUPPORT', verifiedAt: new Date() }),
      },
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: id(11), emailVerifiedAt: new Date(), mfaEnabled: true }) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const result: any = await serviceWith(prisma).addVerifiedMember({ publisherId: id(1), accountId: id(11), role: 'SUPPORT', verifiedBy: id(10) });
    expect(prisma.publisherMember.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publisherId: id(1), accountId: id(11), role: 'SUPPORT' }) }));
    expect(result).toMatchObject({ id: 'new-member', role: 'SUPPORT' });
  });

  it('prevents suspending the final active owner', async () => {
    const prisma: any = {
      publisherMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'owner-role' }),
        findUnique: jest.fn().mockResolvedValue({ id: id(12), publisherId: id(1), accountId: id(11), role: 'OWNER', suspendedAt: null }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    await expect(serviceWith(prisma).suspendMember({ publisherId: id(1), memberId: id(12), verifiedBy: id(10) })).rejects.toThrow('final active owner');
  });

  it('reactivates a suspended member when verified by owner/admin', async () => {
    const prisma: any = {
      publisherMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'owner-role' }),
        findUnique: jest.fn().mockResolvedValue({ id: id(13), publisherId: id(1), accountId: id(11), role: 'SUPPORT', suspendedAt: new Date() }),
        update: jest.fn().mockResolvedValue({ id: id(13), publisherId: id(1), accountId: id(11), role: 'SUPPORT', suspendedAt: null }),
      },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-reactivate' }) },
    };
    const result: any = await serviceWith(prisma).reactivateMember({ publisherId: id(1), memberId: id(13), verifiedBy: id(10) });
    expect(prisma.publisherMember.update).toHaveBeenCalledWith({ where: { id: id(13) }, data: { suspendedAt: null } });
    expect(result).toMatchObject({ id: id(13), suspendedAt: null });
  });

  it('lists reviewer queue submissions only for reviewer identities', async () => {
    const prisma: any = {
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer-role' }) },
      pluginSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: id(40), status: 'NEEDS_REVIEW', riskLevel: 'HIGH', submittedAt: new Date('2026-09-01T00:00:00.000Z'), decidedAt: null,
            publisher: { id: id(1), slug: 'acme', displayName: 'Acme Plugins' },
            pluginVersion: { id: id(30), pluginId: 'acme.plugin', version: '1.0.0', channel: 'STABLE', reviewStatus: 'IN_REVIEW', publishedAt: null, withdrawnAt: null },
            _count: { reviews: 1 },
          },
        ]),
      },
    };
    const result: any = await serviceWith(prisma).reviewerSubmissions(id(10), { status: 'NEEDS_REVIEW', limit: '20' });
    expect(prisma.pluginSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'NEEDS_REVIEW' } }));
    expect(result.items[0]).toMatchObject({ id: id(40), status: 'NEEDS_REVIEW' });
  });

  it('blocks reviewer queue access for non-reviewer accounts', async () => {
    const prisma: any = { publisherMember: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(serviceWith(prisma).reviewerSubmissions(id(99), { limit: '20' })).rejects.toThrow('Reviewer role is not authorized');
  });

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
    await expect(service.review({ submissionId: id(5), reviewerId: id(2), decision: 'APPROVE', notes: 'Static and migration review passed', evidence: { checks: ['static-analysis', 'migration-review'], artifacts: ['sandbox-log'], ticket: 'SEC-1001' } })).resolves.toMatchObject({ requiredApprovals: 2, approved: false });
    await expect(service.review({ submissionId: id(5), reviewerId: id(3), decision: 'APPROVE', notes: 'Independent reproduction passed', evidence: { checks: ['repro-validation'], artifacts: ['policy-checklist'], ticket: 'SEC-1002' } })).resolves.toMatchObject({ requiredApprovals: 2, approved: true });
    expect(prisma.pluginVersion.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewStatus: 'APPROVED' }) }));
  });

  it('requires two approvals for critical-risk submissions', async () => {
    const firstReview = { id: 'review-c1', submissionId: id(60), reviewerId: id(2), decision: 'APPROVE', notes: 'one', evidence: {} };
    const submission = { id: id(60), status: 'NEEDS_REVIEW', riskLevel: 'CRITICAL', submittedBy: id(1), pluginVersionId: id(6), reviews: [], pluginVersion: { pluginId: 'vendor.plugin' } };
    const prisma: any = {
      pluginSubmission: { findUnique: jest.fn().mockResolvedValueOnce(submission).mockResolvedValueOnce({ ...submission, reviews: [firstReview] }), update: jest.fn() },
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer' }) },
      submissionReview: { create: jest.fn().mockResolvedValueOnce(firstReview).mockResolvedValueOnce({ ...firstReview, id: 'review-c2', reviewerId: id(3) }) },
      pluginVersion: { update: jest.fn() }, marketplacePlugin: { update: jest.fn() },
    };
    const service = serviceWith(prisma);
    await expect(service.review({ submissionId: id(60), reviewerId: id(2), decision: 'APPROVE', notes: 'Critical review part one', evidence: { checks: ['static-analysis'], artifacts: ['sandbox-log'], ticket: 'SEC-2001' } })).resolves.toMatchObject({ requiredApprovals: 2, approved: false });
    await expect(service.review({ submissionId: id(60), reviewerId: id(3), decision: 'APPROVE', notes: 'Critical review part two', evidence: { checks: ['runtime-validation'], artifacts: ['policy-checklist'], ticket: 'SEC-2002' } })).resolves.toMatchObject({ requiredApprovals: 2, approved: true });
  });

  it('rejects review evidence without checks for normal risk submissions', async () => {
    const submission = { id: id(50), status: 'NEEDS_REVIEW', riskLevel: 'NORMAL', submittedBy: id(1), pluginVersionId: id(6), reviews: [], pluginVersion: { pluginId: 'vendor.plugin' } };
    const prisma: any = {
      pluginSubmission: { findUnique: jest.fn().mockResolvedValue(submission), update: jest.fn() },
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer' }) },
      submissionReview: { create: jest.fn() },
      pluginVersion: { update: jest.fn() }, marketplacePlugin: { update: jest.fn() },
    };
    await expect(serviceWith(prisma).review({ submissionId: id(50), reviewerId: id(2), decision: 'APPROVE', notes: 'Looks good', evidence: {} })).rejects.toThrow('checks[]');
    expect(prisma.submissionReview.create).not.toHaveBeenCalled();
  });

  it('rejects high-risk evidence without artifacts and ticket', async () => {
    const submission = { id: id(51), status: 'NEEDS_REVIEW', riskLevel: 'HIGH', submittedBy: id(1), pluginVersionId: id(6), reviews: [], pluginVersion: { pluginId: 'vendor.plugin' } };
    const prisma: any = {
      pluginSubmission: { findUnique: jest.fn().mockResolvedValue(submission), update: jest.fn() },
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer' }) },
      submissionReview: { create: jest.fn() },
      pluginVersion: { update: jest.fn() }, marketplacePlugin: { update: jest.fn() },
    };
    await expect(serviceWith(prisma).review({ submissionId: id(51), reviewerId: id(2), decision: 'APPROVE', notes: 'Looks good', evidence: { checks: ['static-analysis'] } })).rejects.toThrow(/artifact|ticket/);
    expect(prisma.submissionReview.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported evidence check names', async () => {
    const submission = { id: id(52), status: 'NEEDS_REVIEW', riskLevel: 'NORMAL', submittedBy: id(1), pluginVersionId: id(6), reviews: [], pluginVersion: { pluginId: 'vendor.plugin' } };
    const prisma: any = {
      pluginSubmission: { findUnique: jest.fn().mockResolvedValue(submission), update: jest.fn() },
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer' }) },
      submissionReview: { create: jest.fn() },
      pluginVersion: { update: jest.fn() }, marketplacePlugin: { update: jest.fn() },
    };
    await expect(serviceWith(prisma).review({ submissionId: id(52), reviewerId: id(2), decision: 'APPROVE', notes: 'Looks good', evidence: { checks: ['unsupported-check'] } })).rejects.toThrow('unsupported check names');
    expect(prisma.submissionReview.create).not.toHaveBeenCalled();
  });

  it('rejects invalid ticket format when provided', async () => {
    const submission = { id: id(53), status: 'NEEDS_REVIEW', riskLevel: 'HIGH', submittedBy: id(1), pluginVersionId: id(6), reviews: [], pluginVersion: { pluginId: 'vendor.plugin' } };
    const prisma: any = {
      pluginSubmission: { findUnique: jest.fn().mockResolvedValue(submission), update: jest.fn() },
      publisherMember: { findFirst: jest.fn().mockResolvedValue({ id: 'reviewer' }) },
      submissionReview: { create: jest.fn() },
      pluginVersion: { update: jest.fn() }, marketplacePlugin: { update: jest.fn() },
    };
    await expect(serviceWith(prisma).review({ submissionId: id(53), reviewerId: id(2), decision: 'APPROVE', notes: 'Looks good', evidence: { checks: ['static-analysis'], artifacts: ['sandbox-log'], ticket: 'ticket-123' } })).rejects.toThrow('ticket format is invalid');
    expect(prisma.submissionReview.create).not.toHaveBeenCalled();
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
