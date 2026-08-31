import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const listInput = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const pluginListInput = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * The read-only slice pulled forward from PA-2 so PA-1 can prove the operator boundary end to end
 * (plan §15 step 5). Every count comes from a purpose-built aggregate query rather than shipping
 * whole tables to the browser, per plan §5.1.
 */
export class PlatformReadService {
  constructor(private readonly prisma: PrismaClient) {}

  async dashboard() {
    const [plugins, publishedVersions, publishers, installations, linkedInstallations, operators, activeEntitlements, pendingOrders, openAdvisories] = await Promise.all([
      this.prisma.marketplacePlugin.count(),
      this.prisma.pluginVersion.count({ where: { reviewStatus: 'APPROVED', withdrawnAt: null } }),
      this.prisma.publisher.count(),
      this.prisma.installationRegistration.count(),
      this.prisma.installationMarketplaceGrant.count({ where: { revokedAt: null } }),
      this.prisma.platformOperator.count({ where: { status: 'ACTIVE' } }),
      this.prisma.installationEntitlement.count({ where: { status: 'ACTIVE' } }),
      this.prisma.marketplaceOrder.count({ where: { status: 'PENDING' } }),
      this.prisma.securityAdvisory.count({ where: { withdrawnAt: null } }),
    ]);
    return {
      catalog: { plugins, publishedVersions, publishers },
      schools: { installations, linkedInstallations, activeEntitlements },
      commerce: { pendingOrders },
      security: { openAdvisories },
      platform: { activeOperators: operators },
    };
  }

  async plugins(query: unknown) {
    const input = pluginListInput.parse(query);
    const rows = await this.prisma.marketplacePlugin.findMany({
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true, name: true, license: true, isPaid: true, status: true, createdAt: true,
        publisher: { select: { slug: true, displayName: true } },
        _count: { select: { versions: true } },
      },
    });
    return this.paginate(rows, input.limit, (row) => row.id);
  }

  async installations(query: unknown) {
    const input = listInput.parse(query);
    const rows = await this.prisma.installationRegistration.findMany({
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true, installationId: true, label: true, lastSeenAt: true, createdAt: true,
        account: { select: { id: true, email: true } },
        grant: { select: { scope: true, consentedAt: true, expiresAt: true, revokedAt: true } },
        _count: { select: { entitlements: true, orders: true } },
      },
    });
    // The account email is a real identifier of a real person; the plan's redaction rule
    // (§5.9: "sensitive values are redacted before persistence, not only before display")
    // applies to audit records, but a support operator legitimately needs to recognize the
    // account -- so mask rather than omit, matching the school-side link status view.
    const masked = rows.map((row) => ({
      ...row,
      account: row.account ? { id: row.account.id, emailMasked: maskEmail(row.account.email) } : null,
    }));
    return this.paginate(masked, input.limit, (row) => row.id);
  }

  async auditEvents(query: unknown) {
    const input = listInput.parse(query);
    const rows = await this.prisma.platformAuditEvent.findMany({
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, action: true, success: true, targetType: true, targetId: true, reason: true,
        correlationId: true, createdAt: true,
        operator: { select: { id: true, email: true, displayName: true } },
      },
    });
    return this.paginate(rows, input.limit, (row) => row.id);
  }

  private paginate<T>(rows: T[], limit: number, idOf: (row: T) => string) {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore && items.length ? idOf(items[items.length - 1]) : null };
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
