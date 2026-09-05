import { Prisma, PrismaClient, SchoolProvisioningStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';
import { cursorClause, pageInput, paginate } from './platform-read-support';

const digestImage = z.string().regex(/^.+@sha256:[a-f0-9]{64}$/, 'image must be pinned by sha256 digest');
const reason = z.string().trim().min(3).max(5000);
const createInput = z.object({
  customerSchoolId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(128),
  targetWorkspaceId: z.string().trim().min(1).max(100),
  environment: z.string().trim().min(1).max(80).default('production'),
  region: z.string().trim().min(1).max(80).optional(),
  releaseVersion: z.string().trim().min(1).max(80),
  apiImage: digestImage, webImage: digestImage, gatewayImage: digestImage,
  requestedDomain: z.string().trim().max(253).optional(),
  internalReason: reason,
}).strict();
const transitionInput = z.object({ internalReason: reason }).strict();
const listInput = pageInput.extend({ status: z.nativeEnum(SchoolProvisioningStatus).optional(), customerSchoolId: z.string().uuid().optional() });

const SUMMARY = {
  id: true, customerSchoolId: true, idempotencyKey: true, status: true, targetWorkspaceId: true,
  environment: true, region: true, releaseVersion: true, requestedDomain: true,
  requestedByOperatorId: true, approvedByOperatorId: true, submittedAt: true, approvedAt: true,
  approvalExpiresAt: true, cancelledAt: true, completedAt: true, lastSuccessfulCheckpoint: true,
  lastErrorCode: true, lastErrorMessage: true, createdAt: true, updatedAt: true,
  school: { select: { id: true, name: true, slug: true, status: true } },
  requestedBy: { select: { id: true, displayName: true } },
  approvedBy: { select: { id: true, displayName: true } },
} as const;

/** Durable control-plane state only. External Railway effects belong to a separately deployed
 * worker, which claims an APPROVED row and records checkpoints through the methods below. */
export class SchoolProvisioningService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(value: unknown) {
    const input = listInput.parse(value);
    const rows = await this.prisma.schoolProvisioningRequest.findMany({
      take: input.limit + 1, ...cursorClause(input.cursor), orderBy: { id: 'asc' },
      where: { ...(input.status ? { status: input.status } : {}), ...(input.customerSchoolId ? { customerSchoolId: input.customerSchoolId } : {}) },
      select: SUMMARY,
    });
    return paginate(rows, input.limit, row => row.id);
  }

  async get(id: string) {
    const row = await this.prisma.schoolProvisioningRequest.findUnique({
      where: { id }, select: { ...SUMMARY, attempts: { orderBy: { attemptNumber: 'desc' }, take: 25 } },
    });
    if (!row) throw new HttpError(404, 'Provisioning request not found');
    return row;
  }

  async create(operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = createInput.parse(value);
    const requestFingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await this.prisma.schoolProvisioningRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: SUMMARY });
    if (existing) {
      const fingerprint = await this.prisma.schoolProvisioningRequest.findUnique({ where: { id: existing.id }, select: { requestFingerprint: true } });
      if (existing.requestedByOperatorId !== operatorId || fingerprint?.requestFingerprint !== requestFingerprint) throw new HttpError(409, 'Idempotency key is already used with a different provisioning request');
      return existing;
    }
    return this.prisma.$transaction(async tx => {
      const school = await tx.customerSchool.findUnique({ where: { id: input.customerSchoolId }, select: { id: true, status: true } });
      if (!school) throw new HttpError(404, 'Customer school not found');
      if (school.status === 'TERMINATED') throw new HttpError(409, 'A terminated school cannot be provisioned');
      const active = await tx.schoolProvisioningRequest.findFirst({ where: { customerSchoolId: school.id, status: { notIn: ['READY', 'CANCELLED'] } }, select: { id: true } });
      if (active) throw new HttpError(409, 'This school already has an unfinished provisioning request');
      const row = await tx.schoolProvisioningRequest.create({ data: { ...input, requestFingerprint, requestedByOperatorId: operatorId }, select: SUMMARY });
      await this.audit(tx, operatorId, context, 'school_provisioning_created', row.id, input.internalReason, { customerSchoolId: input.customerSchoolId });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  submit(id: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    return this.transition(id, operatorId, value, context, ['DRAFT'], 'PENDING_APPROVAL', 'school_provisioning_submitted', { submittedAt: now });
  }

  async approve(id: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = transitionInput.parse(value);
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, id);
      const current = await tx.schoolProvisioningRequest.findUnique({ where: { id }, select: { id: true, status: true, requestedByOperatorId: true } });
      if (!current) throw new HttpError(404, 'Provisioning request not found');
      if (current.status !== 'PENDING_APPROVAL') throw new HttpError(409, `Cannot approve provisioning from ${current.status}`);
      if (current.requestedByOperatorId === operatorId) throw new HttpError(409, 'A different operator must approve infrastructure creation');
      const row = await tx.schoolProvisioningRequest.update({ where: { id }, data: { status: 'APPROVED', approvedByOperatorId: operatorId, approvedAt: now, approvalExpiresAt: new Date(now.getTime() + 60 * 60_000) }, select: SUMMARY });
      await this.audit(tx, operatorId, context, 'school_provisioning_approved', id, input.internalReason);
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  cancel(id: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    return this.transition(id, operatorId, value, context, ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'FAILED_RETRYABLE'], 'CANCELLED', 'school_provisioning_cancelled', { cancelledAt: now });
  }

  async retry(id: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = transitionInput.parse(value);
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, id);
      const current = await tx.schoolProvisioningRequest.findUnique({ where: { id }, select: { status: true, approvalExpiresAt: true } });
      if (!current) throw new HttpError(404, 'Provisioning request not found');
      if (current.status !== 'FAILED_RETRYABLE') throw new HttpError(409, `Cannot retry provisioning from ${current.status}`);
      const stillApproved = Boolean(current.approvalExpiresAt && current.approvalExpiresAt > now);
      const row = await tx.schoolProvisioningRequest.update({ where: { id }, data: { status: stillApproved ? 'APPROVED' : 'PENDING_APPROVAL', lastErrorCode: null, lastErrorMessage: null, ...(!stillApproved ? { approvedByOperatorId: null, approvedAt: null, approvalExpiresAt: null } : {}) }, select: SUMMARY });
      await this.audit(tx, operatorId, context, 'school_provisioning_retry_requested', id, input.internalReason, { approvalRetained: stillApproved });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** Worker boundary. Claiming is serialized and never performs an external effect in the DB transaction. */
  async claimApproved(workerId: string, now = new Date()) {
    return this.prisma.$transaction(async tx => {
      const candidate = await tx.schoolProvisioningRequest.findFirst({ where: { status: 'APPROVED', approvalExpiresAt: { gt: now } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (!candidate) return null;
      await this.lock(tx, candidate.id);
      const current = await tx.schoolProvisioningRequest.findUnique({ where: { id: candidate.id }, select: { status: true, approvalExpiresAt: true, _count: { select: { attempts: true } } } });
      if (!current || current.status !== 'APPROVED' || !current.approvalExpiresAt || current.approvalExpiresAt <= now) return null;
      const attempt = await tx.schoolProvisioningAttempt.create({ data: { requestId: candidate.id, attemptNumber: current._count.attempts + 1, workerId } });
      const request = await tx.schoolProvisioningRequest.update({ where: { id: candidate.id }, data: { status: 'PROVISIONING' }, select: SUMMARY });
      return { request, attempt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async completeAttempt(requestId: string, attemptId: string, checkpoint = 'verified', now = new Date()) {
    return this.finishAttempt(requestId, attemptId, 'SUCCEEDED', { status: 'READY', completedAt: now, lastSuccessfulCheckpoint: checkpoint, lastErrorCode: null, lastErrorMessage: null }, now);
  }

  async failAttempt(requestId: string, attemptId: string, errorCode: string, errorMessage: string, checkpoint?: string, now = new Date()) {
    const safeCode = errorCode.replace(/[^A-Z0-9_.-]/gi, '_').slice(0, 100);
    const safeMessage = errorMessage.replace(/(token|secret|password|authorization)\s*[=:]\s*\S+/gi, '$1=[REDACTED]').slice(0, 1000);
    return this.finishAttempt(requestId, attemptId, 'FAILED', { status: 'FAILED_RETRYABLE', lastErrorCode: safeCode, lastErrorMessage: safeMessage, ...(checkpoint ? { lastSuccessfulCheckpoint: checkpoint } : {}) }, now, safeCode, safeMessage);
  }

  private async finishAttempt(requestId: string, attemptId: string, attemptStatus: 'SUCCEEDED' | 'FAILED', requestData: Prisma.SchoolProvisioningRequestUpdateInput, now: Date, errorCode?: string, errorMessage?: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, requestId);
      const attempt = await tx.schoolProvisioningAttempt.findUnique({ where: { id: attemptId }, select: { id: true, requestId: true, status: true } });
      if (!attempt || attempt.requestId !== requestId) throw new HttpError(404, 'Provisioning attempt not found');
      if (attempt.status !== 'RUNNING') throw new HttpError(409, 'Provisioning attempt is already finished');
      await tx.schoolProvisioningAttempt.update({ where: { id: attemptId }, data: { status: attemptStatus, finishedAt: now, errorCode, errorMessage } });
      return tx.schoolProvisioningRequest.update({ where: { id: requestId }, data: requestData, select: SUMMARY });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async transition(id: string, operatorId: string, value: unknown, context: PlatformActionContext, allowed: SchoolProvisioningStatus[], next: SchoolProvisioningStatus, action: string, extra: Prisma.SchoolProvisioningRequestUpdateInput = {}) {
    const input = transitionInput.parse(value);
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, id);
      const current = await tx.schoolProvisioningRequest.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw new HttpError(404, 'Provisioning request not found');
      if (!allowed.includes(current.status)) throw new HttpError(409, `Cannot move provisioning from ${current.status} to ${next}`);
      const row = await tx.schoolProvisioningRequest.update({ where: { id }, data: { status: next, ...extra }, select: SUMMARY });
      await this.audit(tx, operatorId, context, action, id, input.internalReason);
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private lock(tx: Prisma.TransactionClient, id: string) {
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('school-provisioning'), hashtext(${id}))`;
  }

  private audit(tx: Prisma.TransactionClient, operatorId: string, context: PlatformActionContext, action: string, targetId: string, internalReason: string, metadata?: Prisma.InputJsonValue) {
    return tx.platformAuditEvent.create({ data: { operatorId, action, success: true, targetType: 'SchoolProvisioningRequest', targetId, reason: internalReason, metadata, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent } });
  }
}
