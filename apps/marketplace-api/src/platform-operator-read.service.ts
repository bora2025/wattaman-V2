import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http-error';
import { cursorClause, pageInput, paginate } from './platform-read-support';

const operatorFilter = pageInput.extend({
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  email: z.string().trim().min(2).max(200).optional(),
});

/** Read-only operator administration. Credential material is excluded in Prisma `select` clauses:
 * password hashes, MFA secrets, recovery-code hashes, and session token hashes never enter memory. */
export class PlatformOperatorReadService {
  constructor(private readonly prisma: PrismaClient) {}

  async operators(query: unknown) {
    const input = operatorFilter.parse(query);
    const rows = await this.prisma.platformOperator.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.email ? { email: { contains: input.email.toLowerCase() } } : {}),
      },
      select: {
        id: true, email: true, displayName: true, status: true, mfaEnabled: true,
        failedLoginCount: true, lockedUntil: true, createdAt: true, updatedAt: true,
        roles: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { id: true, createdAt: true, expiresAt: true, role: { select: { key: true, displayName: true } } },
        },
        _count: { select: { sessions: true } },
      },
    });
    return paginate(rows, input.limit, row => row.id);
  }

  async operator(operatorId: string) {
    const operator = await this.prisma.platformOperator.findUnique({
      where: { id: operatorId },
      select: {
        id: true, email: true, displayName: true, status: true, mfaEnabled: true,
        failedLoginCount: true, lockedUntil: true, createdAt: true, updatedAt: true,
        roles: {
          select: {
            id: true, grantedBy: true, createdAt: true, expiresAt: true,
            role: {
              select: {
                id: true, key: true, displayName: true, description: true,
                permissions: { select: { permission: { select: { key: true, description: true } } } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          select: {
            id: true, mfaVerified: true, createdAt: true, expiresAt: true, revokedAt: true,
            replacedBySessionId: true, ip: true, userAgent: true,
          },
          orderBy: { createdAt: 'desc' }, take: 100,
        },
        _count: { select: { mfaRecoveryCodes: true, auditEvents: true } },
      },
    });
    if (!operator) throw new HttpError(404, 'Platform operator not found');
    return operator;
  }

  async roles() {
    return this.prisma.platformRole.findMany({
      orderBy: { key: 'asc' },
      select: {
        id: true, key: true, displayName: true, description: true,
        permissions: { select: { permission: { select: { key: true, description: true } } }, orderBy: { permission: { key: 'asc' } } },
        _count: { select: { operatorRoles: true } },
      },
    });
  }
}
