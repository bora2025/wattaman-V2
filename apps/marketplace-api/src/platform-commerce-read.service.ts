import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { cursorClause, maskEmail, pageInput, paginate } from './platform-read-support';

const orderFilter = pageInput.extend({
  status: z.enum(['PENDING', 'PAID', 'CANCELLED', 'REFUNDED']).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});

const entitlementFilter = pageInput.extend({
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'REFUNDED']).optional(),
  pluginId: z.string().trim().min(1).max(100).optional(),
});

const advisoryFilter = pageInput.extend({
  severity: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).optional(),
  open: z.enum(['true', 'false']).optional(),
});

/**
 * PA-2 read surface for commerce and security records. Amounts stay in minor units end to end;
 * an entitlement's `signedToken` is never returned — it is bearer-shaped material a school
 * presents to prove a licence, so an operator screen has no business handing out copies of it.
 */
export class PlatformCommerceReadService {
  constructor(private readonly prisma: PrismaClient) {}

  async orders(query: unknown) {
    const input = orderFilter.parse(query);
    const rows = await this.prisma.marketplaceOrder.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
      },
      select: {
        id: true, status: true, currency: true, totalMinor: true, createdAt: true, updatedAt: true,
        account: { select: { id: true, displayName: true, email: true } },
        installation: { select: { id: true, installationId: true, label: true } },
        _count: { select: { lines: true, payments: true, refunds: true } },
      },
    });
    const masked = rows.map((row) => ({ ...row, account: { ...row.account, email: maskEmail(row.account.email) } }));
    return paginate(masked, input.limit, (row) => row.id);
  }

  async order(orderId: string) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true, status: true, currency: true, totalMinor: true, createdAt: true, updatedAt: true,
        account: { select: { id: true, displayName: true, email: true } },
        installation: { select: { id: true, installationId: true, label: true } },
        lines: {
          select: {
            id: true, unitPriceMinor: true, updatesThrough: true,
            plugin: { select: { id: true, name: true } },
            price: { select: { id: true, currency: true, amountMinor: true, licensedMajor: true, licenseDays: true, updatesDays: true } },
            entitlement: { select: { id: true, status: true, expiresAt: true, updatesThrough: true, revokedAt: true, revokedReason: true } },
          },
        },
        // Payment evidence matters for reconciliation; the provider reference is the join key an
        // operator uses against the processor's own dashboard.
        payments: { select: { id: true, provider: true, providerRef: true, status: true, amountMinor: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        refunds: { select: { id: true, amountMinor: true, reason: true, initiatedBy: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new HttpError(404, 'Order not found');
    return { ...order, account: { ...order.account, email: maskEmail(order.account.email) } };
  }

  async entitlements(query: unknown) {
    const input = entitlementFilter.parse(query);
    const rows = await this.prisma.installationEntitlement.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.pluginId ? { pluginId: input.pluginId } : {}),
      },
      select: {
        id: true, pluginId: true, status: true, expiresAt: true, updatesThrough: true,
        offlineUntil: true, revokedAt: true, revokedReason: true, tokenId: true, createdAt: true,
        plugin: { select: { name: true } },
        installation: { select: { id: true, installationId: true, label: true, account: { select: { id: true, email: true } } } },
      },
    });
    const masked = rows.map((row) => ({
      ...row,
      installation: {
        ...row.installation,
        account: row.installation.account ? { id: row.installation.account.id, email: maskEmail(row.installation.account.email) } : null,
      },
    }));
    return paginate(masked, input.limit, (row) => row.id);
  }

  async advisories(query: unknown) {
    const input = advisoryFilter.parse(query);
    const rows = await this.prisma.securityAdvisory.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.open === 'true' ? { withdrawnAt: null } : {}),
        ...(input.open === 'false' ? { withdrawnAt: { not: null } } : {}),
      },
      select: {
        id: true, pluginId: true, title: true, severity: true, affectedVersions: true,
        fixedVersion: true, recommendedAction: true, communicationUrl: true,
        publishedAt: true, withdrawnAt: true,
        plugin: { select: { name: true } },
      },
    });
    return paginate(rows, input.limit, (row) => row.id);
  }

  /**
   * Operations health (plan §5.8). Deliberately reports only what the marketplace can observe
   * about itself — there is no route here to a school's own health, which each school owns.
   */
  async operationsHealth() {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [database, pendingOrders, failedPayments, openDisputes, expiringEntitlements, staleInstallations, unprocessedWebhooks, withdrawnReleases] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const).catch(() => 'unreachable' as const),
      this.prisma.marketplaceOrder.count({ where: { status: 'PENDING' } }),
      this.prisma.marketplacePayment.count({ where: { status: 'FAILED' } }),
      this.prisma.marketplacePaymentDispute.count({ where: { status: 'OPEN' } }),
      this.prisma.installationEntitlement.count({ where: { status: 'ACTIVE', expiresAt: { lte: soon } } }),
      this.prisma.installationRegistration.count({ where: { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }] } }),
      this.prisma.paymentWebhookEvent.count({ where: { processedAt: null } }),
      this.prisma.pluginVersion.count({ where: { withdrawnAt: { not: null } } }),
    ]);
    return {
      checkedAt: now.toISOString(),
      database,
      // Each of these is an "someone should look at this" signal, not an error on its own.
      attention: {
        pendingOrders,
        failedPayments,
        openDisputes,
        entitlementsExpiringWithin30Days: expiringEntitlements,
        installationsNotSeenIn30Days: staleInstallations,
        unprocessedPaymentWebhooks: unprocessedWebhooks,
        withdrawnReleases,
      },
    };
  }
}
