import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { cursorClause, maskEmail, pageInput, paginate } from './platform-read-support';

const customerFilter = pageInput.extend({
  email: z.string().trim().min(2).max(200).optional(),
  verified: z.enum(['true', 'false']).optional(),
});

const installationFilter = pageInput.extend({
  label: z.string().trim().min(1).max(120).optional(),
  linked: z.enum(['true', 'false']).optional(),
});

const publisherFilter = pageInput.extend({
  status: z.enum(['PENDING', 'VERIFIED', 'SUSPENDED']).optional(),
  slug: z.string().trim().min(1).max(100).optional(),
});

const pluginFilter = pageInput.extend({
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  paid: z.enum(['true', 'false']).optional(),
  publisher: z.string().trim().min(1).max(100).optional(),
});

const submissionFilter = pageInput.extend({
  status: z.enum(['ANALYZING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  riskLevel: z.string().trim().min(1).max(40).optional(),
});

/**
 * PA-2 read surface for customer accounts, school installations, publishers, the plugin catalog,
 * and submissions. Every query here is deliberately read-only and reads only marketplace-owned
 * models — the platform admin has no route to a school's own database (plan §2).
 *
 * Nothing in this file ever selects `passwordHash`, `mfaSecret`, a session token digest, or an
 * entitlement's signed token: those are excluded at the query level rather than filtered after
 * loading, so a future change to a response shape cannot accidentally leak them.
 */
export class PlatformDirectoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async customers(query: unknown) {
    const input = customerFilter.parse(query);
    const rows = await this.prisma.marketplaceAccount.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.email ? { email: { contains: input.email.toLowerCase() } } : {}),
        ...(input.verified === 'true' ? { emailVerifiedAt: { not: null } } : {}),
        ...(input.verified === 'false' ? { emailVerifiedAt: null } : {}),
      },
      select: {
        id: true, displayName: true, email: true, emailVerifiedAt: true, mfaEnabled: true,
        lockedUntil: true, createdAt: true,
        _count: { select: { installations: true, orders: true } },
      },
    });
    return paginate(rows.map((row) => ({ ...row, email: maskEmail(row.email) })), input.limit, (row) => row.id);
  }

  async customer(accountId: string) {
    const account = await this.prisma.marketplaceAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true, displayName: true, email: true, emailVerifiedAt: true, mfaEnabled: true,
        failedLoginCount: true, lockedUntil: true, createdAt: true, updatedAt: true,
        // Only whether codes remain, never the codes: support needs to know if the owner is locked
        // out, not anything that would help sign in as them.
        mfaRecoveryCodes: { select: { usedAt: true } },
        installations: {
          select: { id: true, installationId: true, label: true, lastSeenAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 50,
        },
        orders: {
          select: { id: true, status: true, currency: true, totalMinor: true, createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 50,
        },
        publisherMemberships: {
          select: { role: true, verifiedAt: true, suspendedAt: true, publisher: { select: { id: true, slug: true, displayName: true } } },
        },
        _count: { select: { sessions: true } },
      },
    });
    if (!account) throw new HttpError(404, 'Customer account not found');
    const { mfaRecoveryCodes, ...rest } = account;
    return {
      ...rest,
      email: maskEmail(account.email),
      recoveryCodesRemaining: mfaRecoveryCodes.filter((code) => !code.usedAt).length,
    };
  }

  async installations(query: unknown) {
    const input = installationFilter.parse(query);
    const rows = await this.prisma.installationRegistration.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.label ? { label: { contains: input.label, mode: 'insensitive' } } : {}),
        ...(input.linked === 'true' ? { grant: { is: { revokedAt: null } } } : {}),
        ...(input.linked === 'false' ? { OR: [{ grant: { is: null } }, { grant: { is: { revokedAt: { not: null } } } }] } : {}),
      },
      select: {
        id: true, installationId: true, label: true, lastSeenAt: true, createdAt: true,
        account: { select: { id: true, email: true } },
        grant: { select: { scope: true, consentedAt: true, expiresAt: true, revokedAt: true } },
        _count: { select: { entitlements: true, orders: true } },
      },
    });
    const masked = rows.map((row) => ({
      ...row,
      account: row.account ? { id: row.account.id, emailMasked: maskEmail(row.account.email) } : null,
    }));
    return paginate(masked, input.limit, (row) => row.id);
  }

  async installation(registrationId: string) {
    const installation = await this.prisma.installationRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true, installationId: true, label: true, lastSeenAt: true, createdAt: true,
        account: { select: { id: true, displayName: true, email: true } },
        // Public key material and revocation state are integrity-sensitive, not secret — an
        // operator investigating a key rotation needs to see exactly this.
        keys: { select: { id: true, keyFingerprint: true, createdAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' } },
        grant: { select: { id: true, scope: true, consentedAt: true, expiresAt: true, revokedAt: true, revokedReason: true } },
        entitlements: {
          select: { id: true, pluginId: true, status: true, expiresAt: true, updatesThrough: true, createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 100,
        },
        orders: {
          select: { id: true, status: true, currency: true, totalMinor: true, createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 50,
        },
      },
    });
    if (!installation) throw new HttpError(404, 'Installation not found');
    return {
      ...installation,
      account: installation.account ? { id: installation.account.id, displayName: installation.account.displayName, email: maskEmail(installation.account.email) } : null,
    };
  }

  async publishers(query: unknown) {
    const input = publisherFilter.parse(query);
    const rows = await this.prisma.publisher.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.slug ? { slug: { contains: input.slug.toLowerCase() } } : {}),
      },
      select: {
        id: true, slug: true, displayName: true, status: true, createdAt: true,
        _count: { select: { plugins: true, members: true, keys: true, submissions: true } },
      },
    });
    return paginate(rows, input.limit, (row) => row.id);
  }

  async publisher(publisherId: string) {
    const publisher = await this.prisma.publisher.findUnique({
      where: { id: publisherId },
      select: {
        id: true, slug: true, displayName: true, status: true, createdAt: true, updatedAt: true,
        keys: { select: { id: true, keyId: true, createdAt: true, approvedAt: true, revokedAt: true, approvedBy: true, revokedBy: true }, orderBy: { createdAt: 'desc' } },
        members: {
          select: { id: true, role: true, verifiedAt: true, suspendedAt: true, account: { select: { id: true, displayName: true, email: true } } },
        },
        plugins: { select: { id: true, name: true, status: true, isPaid: true }, orderBy: { id: 'asc' }, take: 100 },
        acceptances: { select: { acceptedAt: true, policy: { select: { policyKey: true, version: true, title: true } } }, orderBy: { acceptedAt: 'desc' } },
        _count: { select: { submissions: true } },
      },
    });
    if (!publisher) throw new HttpError(404, 'Publisher not found');
    return {
      ...publisher,
      members: publisher.members.map((member) => ({ ...member, account: { ...member.account, email: maskEmail(member.account.email) } })),
    };
  }

  async plugins(query: unknown) {
    const input = pluginFilter.parse(query);
    const rows = await this.prisma.marketplacePlugin.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.paid ? { isPaid: input.paid === 'true' } : {}),
        ...(input.publisher ? { publisher: { slug: { contains: input.publisher.toLowerCase() } } } : {}),
      },
      select: {
        id: true, name: true, license: true, isPaid: true, status: true, createdAt: true,
        publisher: { select: { id: true, slug: true, displayName: true } },
        _count: { select: { versions: true, entitlements: true } },
      },
    });
    return paginate(rows, input.limit, (row) => row.id);
  }

  async plugin(pluginId: string) {
    const plugin = await this.prisma.marketplacePlugin.findUnique({
      where: { id: pluginId },
      select: {
        id: true, name: true, description: true, license: true, isPaid: true, status: true,
        createdAt: true, updatedAt: true,
        publisher: { select: { id: true, slug: true, displayName: true, status: true } },
        versions: {
          select: {
            id: true, version: true, requiresCore: true, channel: true, reviewStatus: true,
            changelog: true, publishedAt: true, withdrawnAt: true, createdAt: true,
            artifact: { select: { sha256: true, sizeBytes: true, publisherKeyId: true, createdAt: true } },
            _count: { select: { downloads: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        prices: { select: { id: true, currency: true, amountMinor: true, licensedMajor: true, validFrom: true, validUntil: true, updatesDays: true, licenseDays: true }, orderBy: { validFrom: 'desc' } },
        advisories: { select: { id: true, title: true, severity: true, affectedVersions: true, fixedVersion: true, recommendedAction: true, publishedAt: true, withdrawnAt: true }, orderBy: { publishedAt: 'desc' } },
        _count: { select: { entitlements: true, orderLines: true } },
      },
    });
    if (!plugin) throw new HttpError(404, 'Plugin not found');
    return plugin;
  }

  async submissions(query: unknown) {
    const input = submissionFilter.parse(query);
    const rows = await this.prisma.pluginSubmission.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      },
      select: {
        id: true, status: true, riskLevel: true, submittedAt: true, decidedAt: true,
        publisher: { select: { id: true, slug: true, displayName: true } },
        pluginVersion: { select: { pluginId: true, version: true, channel: true } },
        _count: { select: { reviews: true } },
      },
    });
    return paginate(rows, input.limit, (row) => row.id);
  }

  async submission(submissionId: string) {
    const submission = await this.prisma.pluginSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true, status: true, riskLevel: true, analysisReport: true, submittedBy: true,
        submittedAt: true, decidedAt: true,
        publisher: { select: { id: true, slug: true, displayName: true, status: true } },
        pluginVersion: {
          select: {
            id: true, pluginId: true, version: true, requiresCore: true, channel: true, reviewStatus: true,
            artifact: { select: { sha256: true, sizeBytes: true, publisherKeyId: true } },
          },
        },
        // Decisions append, never overwrite (plan §5.6) -- the whole history is the record.
        reviews: {
          select: { id: true, decision: true, notes: true, evidence: true, createdAt: true, reviewer: { select: { id: true, displayName: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!submission) throw new HttpError(404, 'Submission not found');
    return {
      ...submission,
      reviews: submission.reviews.map((review) => ({ ...review, reviewer: { ...review.reviewer, email: maskEmail(review.reviewer.email) } })),
    };
  }
}
