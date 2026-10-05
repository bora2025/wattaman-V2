import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from './identity-crypto';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';
import { cursorClause, maskEmail, pageInput, paginate } from './platform-read-support';

const email = z.string().trim().toLowerCase().email().max(200);
const submitInput = z.object({
  email,
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(1).max(120),
  schoolName: z.string().trim().min(2).max(200).optional(),
}).strict();
const listInput = pageInput.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });
const decisionInput = z.object({ internalReason: z.string().trim().min(3).max(5000) }).strict();

export class MarketplaceAccountRequestService {
  constructor(private readonly prisma: PrismaClient) {}

  async submit(value: unknown) {
    const input = submitInput.parse(value);
    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.marketplaceAccount.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new HttpError(409, 'This email already has a Marketplace account. Do not create another account; use the existing email, password, and MFA code with the new school enrollment token.');
      }
      const pending = await tx.marketplaceAccountRequest.findFirst({ where: { email: input.email, status: 'PENDING' }, select: { id: true } });
      if (pending) throw new HttpError(409, 'A pending marketplace account request already exists for this email');
      const request = await tx.marketplaceAccountRequest.create({
        data: { email: input.email, displayName: input.displayName, passwordHash, schoolName: input.schoolName },
        select: { id: true, status: true, createdAt: true },
      });
      return { ...request, message: 'Request submitted for Platform Admin review.' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async status(id: string) {
    const request = await this.prisma.marketplaceAccountRequest.findUnique({
      where: { id }, select: { id: true, email: true, displayName: true, schoolName: true, status: true, createdAt: true, reviewedAt: true, reviewReason: true, createdAccountId: true },
    });
    if (!request) throw new HttpError(404, 'Marketplace account request not found');
    return { ...request, email: maskEmail(request.email) };
  }

  async list(value: unknown) {
    const input = listInput.parse(value);
    const rows = await this.prisma.marketplaceAccountRequest.findMany({
      where: input.status ? { status: input.status } : {}, ...cursorClause(input.cursor), take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, email: true, displayName: true, schoolName: true, status: true, createdAt: true, reviewedAt: true, reviewedBy: { select: { displayName: true } } },
    });
    return paginate(rows.map(row => ({ ...row, email: maskEmail(row.email) })), input.limit, row => row.id);
  }

  async decide(id: string, operatorId: string, approved: boolean, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = decisionInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.marketplaceAccountRequest.findUnique({ where: { id } });
      if (!request) throw new HttpError(404, 'Marketplace account request not found');
      if (request.status !== 'PENDING') throw new HttpError(409, 'Marketplace account request was already decided');
      let accountId: string | null = null;
      let reusedExistingAccount = false;
      if (approved) {
        const existingAccount = await tx.marketplaceAccount.findUnique({ where: { email: request.email }, select: { id: true } });
        if (existingAccount) {
          // An account belongs to a person, not one school. Reusing it does not authenticate or
          // claim the installation: the owner must still prove its password + MFA while redeeming
          // the new school's enrollment token. Never replace the existing password from this
          // request, because an untrusted duplicate request must not rotate account credentials.
          accountId = existingAccount.id;
          reusedExistingAccount = true;
        } else {
          if (!request.passwordHash) throw new HttpError(409, 'Marketplace account request no longer contains an activation credential');
          const account = await tx.marketplaceAccount.create({ data: { email: request.email, displayName: request.displayName, passwordHash: request.passwordHash }, select: { id: true } });
          accountId = account.id;
        }
      }
      const decided = await tx.marketplaceAccountRequest.update({
        where: { id }, data: { status: approved ? 'APPROVED' : 'REJECTED', reviewedByOperatorId: operatorId, reviewReason: input.internalReason, reviewedAt: now, createdAccountId: accountId, passwordHash: null },
        select: { id: true, status: true, createdAccountId: true, reviewedAt: true },
      });
      await tx.platformAuditEvent.create({ data: {
        operatorId, action: approved ? 'marketplace_account_request_approved' : 'marketplace_account_request_rejected', success: true,
        targetType: 'MarketplaceAccountRequest', targetId: id, reason: input.internalReason,
        metadata: accountId ? { accountId, reusedExistingAccount } : Prisma.JsonNull, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
      } });
      return decided;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
