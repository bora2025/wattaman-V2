import { createHash } from 'node:crypto';
import { Prisma, PrismaClient, RevenueEntryType } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { RepositoryService } from './repository.service';

const uuid = z.string().uuid();
const policyInput = z.object({
  policyKey: z.enum(['publisher-agreement', 'acceptable-use', 'privacy-security', 'revenue-refund-support']),
  version: z.string().regex(/^\d+\.\d+$/), title: z.string().trim().min(1).max(200),
  body: z.string().min(100).max(200_000), effectiveAt: z.coerce.date(),
}).strict();
const publisherInput = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/), displayName: z.string().trim().min(1).max(120), ownerAccountId: uuid }).strict();
const memberInput = z.object({ publisherId: uuid, accountId: uuid, role: z.enum(['OWNER', 'ADMIN', 'RELEASE_MANAGER', 'FINANCE', 'SUPPORT', 'REVIEWER']), verifiedBy: uuid }).strict();
const publisherApprovalInput = z.object({ publisherId: uuid, approvedBy: uuid }).strict();
const reviewerInput = z.object({ accountId: uuid }).strict();
const keyInput = z.object({ publisherId: uuid, keyId: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/), publicKeyPem: z.string().includes('PUBLIC KEY'), requestedBy: uuid }).strict();
const approvalInput = z.object({ keyRecordId: uuid, approvedBy: uuid }).strict();
const acceptanceInput = z.object({ policyId: uuid, publisherId: uuid, accountId: uuid, ip: z.string().max(100).optional(), userAgent: z.string().max(500).optional() }).strict();
const reviewInput = z.object({ submissionId: uuid, reviewerId: uuid, decision: z.enum(['APPROVE', 'REJECT']), notes: z.string().trim().min(1).max(5000), evidence: z.record(z.unknown()).default({}) }).strict();
const statementInput = z.object({ publisherId: uuid, currency: z.string().regex(/^[A-Z]{3}$/), periodStart: z.coerce.date(), periodEnd: z.coerce.date() }).strict();
const correctionInput = z.object({ entryId: uuid, grossMinor: z.number().int(), feeMinor: z.number().int(), taxMinor: z.number().int(), description: z.string().min(1).max(1000), createdBy: uuid, approvedBy: uuid }).strict();
const payoutInput = z.object({ publisherId: uuid, currency: z.string().regex(/^[A-Z]{3}$/), entryIds: z.array(uuid).min(1), requestedBy: uuid }).strict();
const payoutApprovalInput = z.object({ payoutId: uuid, approvedBy: uuid }).strict();
const payoutPaidInput = z.object({ payoutId: uuid, paidBy: uuid, providerReference: z.string().min(1).max(200) }).strict();

export class PublisherGovernanceService {
  constructor(private readonly prisma: PrismaClient, private readonly repository: RepositoryService) {}

  publishPolicy(value: unknown) {
    const input = policyInput.parse(value);
    const { body, ...record } = input;
    return this.prisma.publisherPolicy.create({ data: { ...record, bodySha256: createHash('sha256').update(body).digest('hex') } });
  }

  listCurrentPolicies() {
    return this.prisma.publisherPolicy.findMany({ where: { retiredAt: null }, orderBy: [{ policyKey: 'asc' }, { effectiveAt: 'desc' }], select: { id: true, policyKey: true, version: true, title: true, bodySha256: true, effectiveAt: true } });
  }

  pilotMetrics() {
    return this.prisma.$transaction(async (tx) => {
      const [publishers, submissions, reviews, withdrawals, supportCases, statements, payouts] = await Promise.all([
        tx.publisher.count({ where: { status: 'VERIFIED', slug: { not: 'wattanam' } } }),
        tx.pluginSubmission.findMany({ include: { reviews: true } }),
        tx.submissionReview.count(),
        tx.pluginVersion.count({ where: { withdrawnAt: { not: null } } }),
        tx.marketplaceAuditEvent.count({ where: { action: { startsWith: 'support_case_' } } }),
        tx.publisherStatement.count(),
        tx.publisherPayout.count({ where: { status: 'PAID' } }),
      ]);
      const decided = submissions.filter((item) => item.decidedAt);
      const reviewHours = decided.length ? decided.reduce((sum, item) => sum + (item.decidedAt!.getTime() - item.submittedAt.getTime()) / 3_600_000, 0) / decided.length : null;
      return { publishers, plugins: new Set(submissions.map((item) => item.pluginVersionId)).size, submissions: submissions.length, approvals: submissions.filter((item) => item.status === 'APPROVED').length, rejections: submissions.filter((item) => item.status === 'REJECTED').length, reviewerDecisions: reviews, withdrawals, supportCases, statements, paidPayouts: payouts, averageReviewHours: reviewHours };
    });
  }

  async launchAssessment() {
    const metrics = await this.pilotMetrics();
    const blockers = [];
    if (metrics.publishers < 3) blockers.push('F-007 requires at least 3 invited, verified third-party publishers');
    if (metrics.plugins < 5) blockers.push('F-007 requires at least 5 pilot plugins');
    if (!metrics.approvals) blockers.push('Pilot has no approved plugin/update');
    if (!metrics.rejections) blockers.push('Pilot has no recorded rejection');
    if (!metrics.withdrawals) blockers.push('Pilot has no vulnerability-withdrawal drill');
    if (!metrics.supportCases) blockers.push('Pilot has no support case');
    if (!metrics.paidPayouts) blockers.push('Pilot has no reconciled payout');
    return { decision: blockers.length ? 'NO_GO' : 'READY_FOR_HUMAN_GO_NO_GO', blockers, metrics, evaluatedAt: new Date().toISOString() };
  }

  async createPublisher(value: unknown) {
    const input = publisherInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.marketplaceAccount.findUnique({ where: { id: input.ownerAccountId } });
      if (!account?.emailVerifiedAt || !account.mfaEnabled) throw new HttpError(409, 'Publisher owner requires verified email and MFA');
      return tx.publisher.create({ data: { slug: input.slug, displayName: input.displayName, members: { create: { accountId: input.ownerAccountId, role: 'OWNER', verifiedAt: new Date() } } }, include: { members: true } });
    });
  }

  async addVerifiedMember(value: unknown) {
    const input = memberInput.parse(value);
    if (input.accountId === input.verifiedBy) throw new HttpError(409, 'Member identity verification requires a second person');
    return this.prisma.$transaction(async (tx) => {
      await requirePublisherRole(tx, input.publisherId, input.verifiedBy, ['OWNER', 'ADMIN']);
      const account = await tx.marketplaceAccount.findUnique({ where: { id: input.accountId } });
      if (!account?.emailVerifiedAt || !account.mfaEnabled) throw new HttpError(409, 'Publisher member requires verified email and MFA');
      const member = await tx.publisherMember.create({ data: { publisherId: input.publisherId, accountId: input.accountId, role: input.role, verifiedAt: new Date() } });
      await audit(tx, input.verifiedBy, 'publisher_member_verified', { publisherId: input.publisherId, memberId: member.id, role: input.role });
      return member;
    });
  }

  async addMarketplaceReviewer(value: unknown) {
    const input = reviewerInput.parse(value);
    const [publisher, account] = await Promise.all([
      this.prisma.publisher.findUnique({ where: { slug: 'wattanam' } }),
      this.prisma.marketplaceAccount.findUnique({ where: { id: input.accountId } }),
    ]);
    if (!publisher || publisher.status !== 'VERIFIED') throw new HttpError(409, 'Official marketplace publisher is not initialized');
    if (!account?.emailVerifiedAt || !account.mfaEnabled) throw new HttpError(409, 'Marketplace reviewer requires verified email and MFA');
    return this.prisma.publisherMember.create({ data: { publisherId: publisher.id, accountId: account.id, role: 'REVIEWER', verifiedAt: new Date() } });
  }

  async approvePublisher(value: unknown) {
    const input = publisherApprovalInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      await requireAnyReviewer(tx, input.approvedBy);
      const existing = await tx.marketplaceAuditEvent.findMany({ where: { action: 'publisher_identity_approval', metadata: { path: ['publisherId'], equals: input.publisherId } } });
      if (existing.some((item) => item.accountId === input.approvedBy)) throw new HttpError(409, 'Reviewer already approved this publisher');
      await audit(tx, input.approvedBy, 'publisher_identity_approval', { publisherId: input.publisherId });
      const approvals = new Set([...existing.map((item) => item.accountId), input.approvedBy]);
      if (approvals.size >= 2) await tx.publisher.update({ where: { id: input.publisherId }, data: { status: 'VERIFIED' } });
      return { publisherId: input.publisherId, approvalCount: approvals.size, verified: approvals.size >= 2 };
    });
  }

  async acceptPolicy(value: unknown) {
    const input = acceptanceInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      await requirePublisherRole(tx, input.publisherId, input.accountId, ['OWNER', 'ADMIN']);
      return tx.publisherPolicyAcceptance.create({ data: input });
    });
  }

  async requestKey(value: unknown) {
    const input = keyInput.parse(value);
    await requirePublisherRole(this.prisma, input.publisherId, input.requestedBy, ['OWNER', 'ADMIN', 'RELEASE_MANAGER']);
    return this.prisma.publisherKey.create({ data: { publisherId: input.publisherId, keyId: input.keyId, publicKeyPem: input.publicKeyPem, enrolledBy: input.requestedBy } });
  }

  async approveKey(value: unknown) {
    const input = approvalInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const key = await tx.publisherKey.findUnique({ where: { id: input.keyRecordId } });
      if (!key) throw new HttpError(404, 'Publisher key not found');
      if (key.enrolledBy === input.approvedBy) throw new HttpError(409, 'Publisher key approval requires a second person');
      await requirePublisherRole(tx, key.publisherId, input.approvedBy, ['OWNER', 'ADMIN']);
      const updated = await tx.publisherKey.update({ where: { id: key.id }, data: { approvedBy: input.approvedBy, approvedAt: new Date() } });
      await audit(tx, input.approvedBy, 'publisher_key_approved', { publisherId: key.publisherId, keyId: key.keyId });
      return updated;
    });
  }

  async revokeKey(value: unknown) {
    const input = approvalInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const key = await tx.publisherKey.findUnique({ where: { id: input.keyRecordId } });
      if (!key) throw new HttpError(404, 'Publisher key not found');
      if (key.enrolledBy === input.approvedBy) throw new HttpError(409, 'Publisher key revocation requires a second person');
      await requirePublisherRole(tx, key.publisherId, input.approvedBy, ['OWNER', 'ADMIN']);
      const active = await tx.publisherKey.count({ where: { publisherId: key.publisherId, approvedAt: { not: null }, revokedAt: null } });
      if (active <= 1 && key.approvedAt && !key.revokedAt) throw new HttpError(409, 'Enroll and approve a replacement before revoking the final active key');
      return tx.publisherKey.update({ where: { id: key.id }, data: { revokedAt: new Date(), revokedBy: input.approvedBy } });
    });
  }

  async submit(fields: unknown, packageBuffer: Buffer, accountId: string) {
    const parsed = z.object({ publisherId: uuid, channel: z.enum(['STABLE', 'BETA']).default('BETA'), changelog: z.string().max(20_000).optional(), paid: z.enum(['true', 'false']).default('false') }).parse(fields);
    await requirePublisherRole(this.prisma, parsed.publisherId, accountId, ['OWNER', 'ADMIN', 'RELEASE_MANAGER']);
    await this.requireCurrentPolicies(parsed.publisherId);
    const published = await this.repository.publishPlugin(parsed, packageBuffer, 'IN_REVIEW');
    const version = await this.prisma.pluginVersion.findUnique({ where: { id: published.pluginVersionId } });
    const report = analyzePackage(version?.manifestJson as Record<string, unknown>, published.analysisSignals);
    const dependencyIds = Object.keys(report.dependencies);
    const advisories = dependencyIds.length ? await this.prisma.securityAdvisory.findMany({ where: { pluginId: { in: dependencyIds }, withdrawnAt: null }, select: { id: true, pluginId: true, severity: true, affectedVersions: true, fixedVersion: true } }) : [];
    report.vulnerabilities = advisories;
    if (advisories.some((item) => ['HIGH', 'CRITICAL'].includes(item.severity))) report.blocking.push('dependency-security-advisory');
    if (advisories.length) report.riskLevel = 'HIGH';
    const status = report.blocking.length ? 'REJECTED' : 'NEEDS_REVIEW';
    const submission = await this.prisma.pluginSubmission.create({ data: { publisherId: parsed.publisherId, pluginVersionId: published.pluginVersionId, submittedBy: accountId, status, riskLevel: report.riskLevel, analysisReport: report as unknown as Prisma.InputJsonValue, decidedAt: status === 'REJECTED' ? new Date() : null } });
    if (status === 'REJECTED') await this.prisma.pluginVersion.update({ where: { id: published.pluginVersionId }, data: { reviewStatus: 'REJECTED' } });
    return { ...published, submissionId: submission.id, status, report };
  }

  async review(value: unknown) {
    const input = reviewInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.pluginSubmission.findUnique({ where: { id: input.submissionId }, include: { reviews: true, pluginVersion: true } });
      if (!submission || submission.status !== 'NEEDS_REVIEW') throw new HttpError(409, 'Submission is not reviewable');
      if (submission.submittedBy === input.reviewerId) throw new HttpError(409, 'Submitter cannot review their own release');
      await requireAnyReviewer(tx, input.reviewerId);
      const review = await tx.submissionReview.create({ data: input as any });
      const decisions = [...submission.reviews, review];
      const rejected = decisions.some((item) => item.decision === 'REJECT');
      const requiredApprovals = submission.riskLevel === 'HIGH' ? 2 : 1;
      const approved = decisions.filter((item) => item.decision === 'APPROVE').length >= requiredApprovals;
      if (rejected || approved) {
        const status = rejected ? 'REJECTED' : 'APPROVED';
        await tx.pluginSubmission.update({ where: { id: submission.id }, data: { status, decidedAt: new Date() } });
        await tx.pluginVersion.update({ where: { id: submission.pluginVersionId }, data: { reviewStatus: status, publishedAt: approved ? new Date() : null } });
        if (approved) await tx.marketplacePlugin.update({ where: { id: submission.pluginVersion.pluginId }, data: { status: 'APPROVED' } });
      }
      return { reviewId: review.id, requiredApprovals, approved, rejected };
    });
  }

  async recordOrderRevenue(orderId: string, feeBasisPoints = DEFAULT_FEE_BASIS_POINTS) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findUnique({ where: { id: orderId }, include: { lines: { include: { plugin: true } } } });
      if (!order || order.status !== 'PAID') throw new HttpError(409, 'Only paid orders can enter the publisher ledger');
      return recordSaleEntries(tx, order, feeBasisPoints);
    });
  }

  async recordRefundRevenue(refundId: string) {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.marketplaceRefund.findUnique({ where: { id: refundId }, include: { order: { include: { lines: { include: { plugin: true, revenueEntries: true } } } } } });
      if (!refund) throw new HttpError(404, 'Refund not found');
      const entries = [];
      for (const line of refund.order.lines) {
        const sale = line.revenueEntries.find((item) => item.type === 'SALE');
        if (!sale) throw new HttpError(409, 'Sale ledger entry is missing');
        entries.push(await tx.publisherRevenueEntry.upsert({ where: { orderLineId_type: { orderLineId: line.id, type: 'REFUND' } }, update: {}, create: { publisherId: line.plugin.publisherId, orderLineId: line.id, refundId, type: 'REFUND', currency: sale.currency, grossMinor: -sale.grossMinor, feeMinor: -sale.feeMinor, taxMinor: -sale.taxMinor, netMinor: -sale.netMinor, description: `Refund ${refund.id}`, createdBy: 'system' } }));
      }
      return entries;
    });
  }

  async correctEntry(value: unknown) {
    const input = correctionInput.parse(value);
    if (input.createdBy === input.approvedBy) throw new HttpError(409, 'Correction requires dual approval');
    const netMinor = input.grossMinor - input.feeMinor - input.taxMinor;
    return this.prisma.publisherRevenueEntry.create({ data: { publisherId: (await this.requireEntry(input.entryId)).publisherId, correctionOfId: input.entryId, type: 'CORRECTION', currency: (await this.requireEntry(input.entryId)).currency, grossMinor: input.grossMinor, feeMinor: input.feeMinor, taxMinor: input.taxMinor, netMinor, description: input.description, createdBy: input.createdBy, approvedBy: input.approvedBy, approvedAt: new Date() } });
  }

  async generateStatement(value: unknown) {
    const input = statementInput.parse(value);
    if (input.periodEnd <= input.periodStart) throw new HttpError(400, 'Statement period is invalid');
    return this.prisma.$transaction(async (tx) => {
      const entries = await tx.publisherRevenueEntry.findMany({ where: { publisherId: input.publisherId, currency: input.currency, createdAt: { gte: input.periodStart, lt: input.periodEnd }, statementLines: { none: {} }, OR: [{ type: { not: 'CORRECTION' } }, { approvedAt: { not: null } }] } });
      const totals = sumEntries(entries);
      return tx.publisherStatement.create({ data: { ...input, ...totals, lines: { create: entries.map((entry) => ({ entryId: entry.id })) } }, include: { lines: true } });
    });
  }

  async requestPayout(value: unknown) {
    const input = payoutInput.parse(value);
    await requirePublisherRole(this.prisma, input.publisherId, input.requestedBy, ['OWNER', 'FINANCE']);
    const entries = await this.prisma.publisherRevenueEntry.findMany({ where: { id: { in: input.entryIds }, publisherId: input.publisherId, currency: input.currency, payoutLines: { none: {} }, statementLines: { some: {} }, OR: [{ type: { not: 'CORRECTION' } }, { approvedAt: { not: null } }] } });
    if (entries.length !== input.entryIds.length) throw new HttpError(409, 'Payout entries are missing, mismatched, or already paid');
    const amountMinor = entries.reduce((sum, entry) => sum + entry.netMinor, 0);
    if (amountMinor <= 0) throw new HttpError(409, 'Payout amount must be positive');
    return this.prisma.publisherPayout.create({ data: { publisherId: input.publisherId, currency: input.currency, amountMinor, requestedBy: input.requestedBy, lines: { create: entries.map((entry) => ({ entryId: entry.id })) } } });
  }

  async approvePayout(value: unknown) {
    const input = payoutApprovalInput.parse(value);
    const payout = await this.prisma.publisherPayout.findUnique({ where: { id: input.payoutId } });
    if (!payout || payout.status !== 'PENDING_APPROVAL') throw new HttpError(409, 'Payout is not pending approval');
    if (payout.requestedBy === input.approvedBy) throw new HttpError(409, 'Payout approval requires a second person');
    await requirePublisherRole(this.prisma, payout.publisherId, input.approvedBy, ['OWNER', 'FINANCE']);
    return this.prisma.publisherPayout.update({ where: { id: payout.id }, data: { status: 'APPROVED', approvedBy: input.approvedBy, approvedAt: new Date() } });
  }

  async markPayoutPaid(value: unknown) {
    const input = payoutPaidInput.parse(value);
    const payout = await this.prisma.publisherPayout.findUnique({ where: { id: input.payoutId } });
    if (!payout || payout.status !== 'APPROVED') throw new HttpError(409, 'Payout is not approved');
    if (payout.approvedBy === input.paidBy || payout.requestedBy === input.paidBy) throw new HttpError(409, 'Payout execution requires separation of duties');
    return this.prisma.publisherPayout.update({ where: { id: payout.id }, data: { status: 'PAID', paidBy: input.paidBy, paidAt: new Date(), providerReference: input.providerReference } });
  }

  private async requireCurrentPolicies(publisherId: string) {
    const policies = await this.prisma.publisherPolicy.findMany({ where: { retiredAt: null, effectiveAt: { lte: new Date() } }, orderBy: { effectiveAt: 'desc' } });
    const current = [...new Map(policies.map((item) => [item.policyKey, item])).values()];
    const accepted = await this.prisma.publisherPolicyAcceptance.count({ where: { publisherId, policyId: { in: current.map((item) => item.id) } } });
    if (current.length < 4 || accepted < current.length) throw new HttpError(409, 'Publisher must accept every current policy before submission');
  }

  private async requireEntry(id: string) {
    const entry = await this.prisma.publisherRevenueEntry.findUnique({ where: { id } });
    if (!entry) throw new HttpError(404, 'Revenue entry not found');
    return entry;
  }
}

function analyzePackage(manifest: Record<string, any>, signals: { embeddedSecret: boolean; commandExecution: boolean; files: string[] }) {
  const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities : [];
  const migrations = Array.isArray(manifest?.migrations) ? manifest.migrations : [];
  const blocking: string[] = [];
  if (signals.embeddedSecret) blocking.push('embedded-secret');
  if (signals.commandExecution) blocking.push('malware-command-execution-pattern');
  const license = typeof manifest?.license === 'string' ? manifest.license : '';
  if (!/^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|GPL-3\.0-only|Proprietary)$/i.test(license)) blocking.push('unapproved-license');
  const risky = migrations.some((item: any) => item.destructive) || capabilities.some((item: string) => ['database.write', 'notifications.send', 'realtime.notify'].includes(item));
  return { schemaVersion: 1, signature: 'verified', manifest: 'valid', dependencies: manifest?.dependencies || {}, license, files: signals.files, malware: blocking.filter((x) => x.includes('malware')), secrets: blocking.filter((x) => x.includes('secret')), vulnerabilities: [] as Array<{ id: string; pluginId: string; severity: string; affectedVersions: string; fixedVersion: string | null }>, migrations, capabilities, blocking, riskLevel: risky ? 'HIGH' : 'NORMAL' };
}

async function requirePublisherRole(tx: any, publisherId: string, accountId: string, roles: string[]) {
  const member = await tx.publisherMember.findFirst({ where: { publisherId, accountId, role: { in: roles }, verifiedAt: { not: null }, suspendedAt: null } });
  if (!member) throw new HttpError(403, 'Publisher role is not authorized');
  return member;
}

async function requireAnyReviewer(tx: any, accountId: string) {
  const member = await tx.publisherMember.findFirst({ where: { accountId, role: 'REVIEWER', verifiedAt: { not: null }, suspendedAt: null, publisher: { slug: 'wattanam', status: 'VERIFIED' } } });
  if (!member) throw new HttpError(403, 'Reviewer role is not authorized');
}

/** Wattanam's share of a sale, in basis points. 1500 = 15%, which is what the manual endpoint has
 *  always defaulted to; the automatic path uses the same number so nothing silently reprices. */
export const DEFAULT_FEE_BASIS_POINTS = 1500;

/**
 * Writes the publisher's share of a paid order into the ledger.
 *
 * Extracted so the manual admin endpoint and the two automatic paths -- an immediate order settling,
 * and a school invoice carrying a plugin being paid -- all write the same entry through the same
 * code. The upsert on (orderLineId, SALE) is what makes it safe to call more than once; the unique
 * index behind it means a retried webhook cannot pay a publisher twice.
 *
 * Called only once an order is PAID, deliberately. A plugin bought on the school's account is
 * licensed before the money arrives, but the publisher's share is not earned until it does.
 */
export async function recordSaleEntries(
  tx: Prisma.TransactionClient,
  order: { id: string; currency: string; lines: Array<{ id: string; unitPriceMinor: number; plugin: { publisherId: string } }> },
  feeBasisPoints = DEFAULT_FEE_BASIS_POINTS,
) {
  const entries = [];
  for (const line of order.lines) {
    const feeMinor = Math.floor(line.unitPriceMinor * feeBasisPoints / 10_000);
    entries.push(await tx.publisherRevenueEntry.upsert({
      where: { orderLineId_type: { orderLineId: line.id, type: 'SALE' } },
      update: {},
      create: {
        publisherId: line.plugin.publisherId, orderLineId: line.id, type: 'SALE', currency: order.currency,
        grossMinor: line.unitPriceMinor, feeMinor, taxMinor: 0, netMinor: line.unitPriceMinor - feeMinor,
        description: `Sale ${order.id}`, createdBy: 'system',
      },
    }));
  }
  return entries;
}

function sumEntries(entries: Array<{ grossMinor: number; feeMinor: number; taxMinor: number; netMinor: number }>) {
  return entries.reduce((sum, item) => ({ grossMinor: sum.grossMinor + item.grossMinor, feeMinor: sum.feeMinor + item.feeMinor, taxMinor: sum.taxMinor + item.taxMinor, netMinor: sum.netMinor + item.netMinor }), { grossMinor: 0, feeMinor: 0, taxMinor: 0, netMinor: 0 });
}

function audit(tx: any, accountId: string, action: string, metadata: Record<string, unknown>) {
  return tx.marketplaceAuditEvent.create({ data: { accountId, action, metadata } });
}
