import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';
import { maskEmail } from './platform-read-support';

const EXPORT_ROW_CAP = 5000;

const exportInput = z.object({
  resource: z.enum(['orders', 'entitlements', 'installations', 'audit-events']),
  limit: z.coerce.number().int().min(1).max(EXPORT_ROW_CAP).default(1000),
});

/** Escapes a value for CSV, and defuses the spreadsheet-formula injection class: a cell starting
 * with = + - @ is executed as a formula by Excel/Sheets when the file is opened. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');
}

/**
 * Exports carry only the minimum fields Finance/Support actually need (plan §5.7), never
 * credential material, and every export writes its own audit row *before* the data is produced —
 * so an export cannot happen without leaving a trace, even if the response fails mid-flight.
 */
export class PlatformExportService {
  constructor(private readonly prisma: PrismaClient) {}

  async export(query: unknown, actor: { operatorId: string; context: PlatformActionContext }) {
    const input = exportInput.parse(query);

    await this.prisma.platformAuditEvent.create({
      data: {
        operatorId: actor.operatorId,
        action: 'platform_export',
        success: true,
        targetType: 'Export',
        targetId: input.resource,
        metadata: { resource: input.resource, limit: input.limit },
        correlationId: actor.context.correlationId,
        ip: actor.context.ip,
        userAgent: actor.context.userAgent,
      },
    });

    switch (input.resource) {
      case 'orders': return this.orders(input.limit);
      case 'entitlements': return this.entitlements(input.limit);
      case 'installations': return this.installations(input.limit);
      case 'audit-events': return this.auditEvents(input.limit);
      default: throw new HttpError(400, 'Unsupported export resource');
    }
  }

  private async orders(limit: number) {
    const rows = await this.prisma.marketplaceOrder.findMany({
      take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, currency: true, totalMinor: true, createdAt: true,
        account: { select: { email: true } },
        installation: { select: { installationId: true, label: true } },
      },
    });
    return {
      filename: 'orders.csv',
      csv: toCsv(
        ['orderId', 'status', 'currency', 'totalMinor', 'createdAt', 'accountEmailMasked', 'installationId', 'installationLabel'],
        rows.map((row) => [row.id, row.status, row.currency, row.totalMinor, row.createdAt, maskEmail(row.account.email), row.installation.installationId, row.installation.label]),
      ),
    };
  }

  private async entitlements(limit: number) {
    const rows = await this.prisma.installationEntitlement.findMany({
      take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, pluginId: true, status: true, expiresAt: true, updatesThrough: true,
        revokedAt: true, revokedReason: true, createdAt: true,
        installation: { select: { installationId: true, label: true } },
      },
    });
    return {
      filename: 'entitlements.csv',
      csv: toCsv(
        ['entitlementId', 'pluginId', 'status', 'expiresAt', 'updatesThrough', 'revokedAt', 'revokedReason', 'createdAt', 'installationId', 'installationLabel'],
        rows.map((row) => [row.id, row.pluginId, row.status, row.expiresAt, row.updatesThrough, row.revokedAt, row.revokedReason, row.createdAt, row.installation.installationId, row.installation.label]),
      ),
    };
  }

  private async installations(limit: number) {
    const rows = await this.prisma.installationRegistration.findMany({
      take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, installationId: true, label: true, lastSeenAt: true, createdAt: true,
        account: { select: { email: true } },
        grant: { select: { revokedAt: true, expiresAt: true } },
      },
    });
    return {
      filename: 'installations.csv',
      csv: toCsv(
        ['registrationId', 'installationId', 'label', 'accountEmailMasked', 'linkState', 'linkExpiresAt', 'lastSeenAt', 'createdAt'],
        rows.map((row) => [
          row.id, row.installationId, row.label, maskEmail(row.account?.email),
          row.grant ? (row.grant.revokedAt ? 'revoked' : 'active') : 'none',
          row.grant?.expiresAt, row.lastSeenAt, row.createdAt,
        ]),
      ),
    };
  }

  private async auditEvents(limit: number) {
    const rows = await this.prisma.platformAuditEvent.findMany({
      take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, action: true, success: true, targetType: true, targetId: true, reason: true,
        correlationId: true, ip: true, createdAt: true,
        operator: { select: { email: true } },
      },
    });
    return {
      filename: 'audit-events.csv',
      csv: toCsv(
        ['eventId', 'createdAt', 'operatorEmail', 'action', 'success', 'targetType', 'targetId', 'reason', 'correlationId', 'ip'],
        rows.map((row) => [row.id, row.createdAt, row.operator?.email ?? '', row.action, row.success, row.targetType, row.targetId, row.reason, row.correlationId, row.ip]),
      ),
    };
  }
}
