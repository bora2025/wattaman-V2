import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { PlatformActionContext } from './platform-context';
import { cursorClause, pageInput, paginate } from './platform-read-support';

const listInput = pageInput;

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

  async auditEvents(query: unknown, reader: { operatorId: string; context: PlatformActionContext }) {
    const input = listInput.parse(query);
    await this.prisma.platformAuditEvent.create({
      data: {
        operatorId: reader.operatorId,
        action: 'platform_audit_read',
        success: true,
        targetType: 'PlatformAuditEvent',
        metadata: { limit: input.limit, cursor: input.cursor ?? null },
        correlationId: reader.context.correlationId,
        ip: reader.context.ip,
        userAgent: reader.context.userAgent,
      },
    });
    const rows = await this.prisma.platformAuditEvent.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, action: true, success: true, targetType: true, targetId: true, reason: true,
        correlationId: true, createdAt: true,
        operator: { select: { id: true, email: true, displayName: true } },
      },
    });
    return paginate(rows, input.limit, (row) => row.id);
  }

}

