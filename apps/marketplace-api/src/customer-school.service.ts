import { Prisma, PrismaClient, SchoolLifecycleStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './http-error';
import { hashToken } from './identity-crypto';
import { PlatformActionContext } from './platform-context';
import { cursorClause, maskEmail, pageInput, paginate } from './platform-read-support';

/** Recognisable at a glance in a chat message or a runbook, so a value pasted into the wrong field
 * is obvious. The prefix is part of the token and part of what gets hashed. */
const TOKEN_PREFIX = 'wtn_enr_';

const DEFAULT_TOKEN_LIFETIME_DAYS = 7;

/**
 * Kebab-case, deliberately the same rule `tools/provision-railway-school.js` enforces on
 * `--school-slug`. Two rules for one identifier is how a slug that provisions cleanly turns out to
 * be unusable in the directory, or the reverse.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schoolFilter = pageInput.extend({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.nativeEnum(SchoolLifecycleStatus).optional(),
  claimed: z.enum(['true', 'false']).optional(),
});

/** Every mutation carries an internal reason. The audit row is the only durable explanation of why
 * a customer record changed, and "someone edited it" is not an explanation. */
const reason = z.string().trim().min(3).max(5000);

const createInput = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(80).regex(SLUG, 'slug must be lowercase kebab-case'),
  region: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  plan: z.string().trim().min(1).max(80).optional(),
  contactName: z.string().trim().min(1).max(200).optional(),
  contactEmail: z.string().email().max(320).optional(),
  railwayProjectId: z.string().trim().min(1).max(100).optional(),
  gatewayOrigin: z.string().url().max(300).optional(),
  notes: z.string().trim().max(10_000).optional(),
  internalReason: reason,
}).strict();

/** Correction only. `slug` is absent on purpose: it is the identifier a provisioned project is
 * named from, so renaming it after the fact would silently detach the record from its
 * infrastructure. A wrong slug is a new record, not an edit. */
const updateInput = createInput.omit({ slug: true }).partial().extend({ internalReason: reason }).strict();

const enrollmentTokenInput = z.object({
  lifetimeDays: z.number().int().min(1).max(30).default(DEFAULT_TOKEN_LIFETIME_DAYS),
  internalReason: reason,
}).strict();

const adoptInput = z.object({
  installationId: z.string().uuid(),
  internalReason: reason,
}).strict();

const SCHOOL_SELECT = {
  id: true, name: true, slug: true, status: true, region: true, timezone: true, locale: true,
  currency: true, plan: true, contactName: true, contactEmail: true, railwayProjectId: true,
  gatewayOrigin: true, notes: true, createdAt: true, updatedAt: true,
  suspendedAt: true, suspendedReason: true, terminatedAt: true, terminatedReason: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

/**
 * The control plane's directory of customer schools (increment 1 of the school-control plan).
 *
 * A school here is a *commercial* record: who the customer is, what they bought, what state their
 * account is in. It never holds school business data — ADR-0002 gives every school its own
 * database and this service has no route into one, which is why nothing below reads anything but
 * marketplace-owned models.
 *
 * The record exists before the infrastructure does. An operator creates it during a sale, mints an
 * enrollment token, and hands that token to whoever deploys the school; the deployment redeems it
 * at registration. That ordering is what lets the console show a named customer rather than the
 * bare UUID it shows today.
 */
export class CustomerSchoolService {
  constructor(private readonly prisma: PrismaClient) {}

  async schools(query: unknown) {
    const input = schoolFilter.parse(query);
    const rows = await this.prisma.customerSchool.findMany({
      take: input.limit + 1,
      ...cursorClause(input.cursor),
      orderBy: { id: 'asc' },
      where: {
        ...(input.name ? { name: { contains: input.name, mode: 'insensitive' } } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.claimed === 'true' ? { installation: { is: {} } } : {}),
        ...(input.claimed === 'false' ? { installation: { is: null } } : {}),
      },
      select: {
        id: true, name: true, slug: true, status: true, region: true, plan: true,
        contactEmail: true, createdAt: true,
        installation: { select: { id: true, installationId: true, lastSeenAt: true } },
        _count: { select: { enrollmentTokens: true } },
      },
    });
    const masked = rows.map((row) => ({ ...row, contactEmail: maskEmail(row.contactEmail) }));
    return paginate(masked, input.limit, (row) => row.id);
  }

  async school(schoolId: string) {
    const school = await this.prisma.customerSchool.findUnique({
      where: { id: schoolId },
      select: {
        ...SCHOOL_SELECT,
        installation: {
          select: {
            id: true, installationId: true, label: true, lastSeenAt: true, createdAt: true,
            account: { select: { id: true, displayName: true, email: true } },
            keys: { select: { id: true, keyFingerprint: true, createdAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' } },
            grant: { select: { id: true, scope: true, consentedAt: true, expiresAt: true, revokedAt: true, revokedReason: true } },
            _count: { select: { entitlements: true, orders: true } },
          },
        },
        // Never `tokenHash`: it is excluded at the query level rather than deleted afterwards, so a
        // later change to this response shape cannot start leaking it.
        enrollmentTokens: {
          select: {
            id: true, createdAt: true, expiresAt: true, consumedAt: true,
            consumedByInstallationId: true, revokedAt: true,
            createdBy: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' }, take: 50,
        },
      },
    });
    if (!school) throw new HttpError(404, 'Customer school not found');
    const installation = school.installation;
    return {
      ...school,
      contactEmail: maskEmail(school.contactEmail),
      installation: installation
        ? {
          ...installation,
          account: installation.account
            ? { id: installation.account.id, displayName: installation.account.displayName, email: maskEmail(installation.account.email) }
            : null,
        }
        : null,
    };
  }

  async create(operatorId: string, value: unknown, context: PlatformActionContext) {
    const { internalReason, ...fields } = createInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      let school;
      try {
        school = await tx.customerSchool.create({
          data: { ...fields, contactEmail: fields.contactEmail?.toLowerCase(), createdByOperatorId: operatorId },
          select: SCHOOL_SELECT,
        });
      } catch (error) {
        // The unique slug is what makes a double-submitted create safe: the retry conflicts instead
        // of producing a second record for one customer.
        if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, `A customer school already uses the slug ${fields.slug}`);
        throw error;
      }
      await this.audit(tx, operatorId, context, {
        action: 'customer_school_created', targetId: school.id, reason: internalReason,
        metadata: { slug: school.slug, name: school.name },
      });
      return { ...school, contactEmail: maskEmail(school.contactEmail) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(schoolId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const { internalReason, ...fields } = updateInput.parse(value);
    if (Object.keys(fields).length === 0) throw new HttpError(400, 'No fields to update');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerSchool.findUnique({ where: { id: schoolId }, select: SCHOOL_SELECT });
      if (!existing) throw new HttpError(404, 'Customer school not found');
      if (existing.status === 'TERMINATED') throw new HttpError(409, 'A terminated school cannot be edited');

      const school = await tx.customerSchool.update({
        where: { id: schoolId },
        data: { ...fields, ...(fields.contactEmail ? { contactEmail: fields.contactEmail.toLowerCase() } : {}) },
        select: SCHOOL_SELECT,
      });
      // The audit row carries the before/after of exactly the fields that moved, so the log alone
      // answers "what changed" without diffing two snapshots by hand.
      await this.audit(tx, operatorId, context, {
        action: 'customer_school_updated', targetId: schoolId, reason: internalReason,
        metadata: {
          changed: Object.fromEntries(Object.keys(fields).map((key) => [
            key,
            { from: (existing as Record<string, unknown>)[key] ?? null, to: (school as Record<string, unknown>)[key] ?? null },
          ])),
        },
      });
      return { ...school, contactEmail: maskEmail(school.contactEmail) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Mints the one-time secret a deployment presents at registration.
   *
   * The plaintext is returned exactly once and never stored — only its SHA-256 lands in the
   * database, the same treatment `MarketplaceSession` gives a session token. That is also why a
   * retry cannot replay: there is nothing left to hand back. Instead of a fake idempotency key
   * that could not honour its contract, a school may hold only one live token at a time, so a
   * double-submit conflicts rather than quietly leaving two valid secrets in circulation.
   */
  async mintEnrollmentToken(schoolId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const input = enrollmentTokenInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const school = await tx.customerSchool.findUnique({
        where: { id: schoolId },
        select: { id: true, name: true, slug: true, status: true, installation: { select: { id: true } } },
      });
      if (!school) throw new HttpError(404, 'Customer school not found');
      if (school.status === 'TERMINATED' || school.status === 'SUSPENDED') {
        throw new HttpError(409, `A ${school.status.toLowerCase()} school cannot enrol an installation`);
      }
      if (school.installation) throw new HttpError(409, 'This school already has a registered installation');

      const live = await tx.schoolEnrollmentToken.findFirst({
        where: { customerSchoolId: schoolId, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (live) throw new HttpError(409, 'This school already has an unused enrollment token; revoke it before minting another');

      const raw = `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
      const expiresAt = new Date(now.getTime() + input.lifetimeDays * 24 * 60 * 60 * 1000);
      const token = await tx.schoolEnrollmentToken.create({
        data: { customerSchoolId: schoolId, tokenHash: hashToken(raw), createdByOperatorId: operatorId, expiresAt },
        select: { id: true, createdAt: true, expiresAt: true },
      });
      if (school.status === 'PROSPECT') {
        await tx.customerSchool.update({ where: { id: schoolId }, data: { status: 'AWAITING_CLAIM' } });
      }
      await this.audit(tx, operatorId, context, {
        action: 'school_enrollment_token_minted', targetId: schoolId, reason: input.internalReason,
        metadata: { tokenId: token.id, expiresAt: expiresAt.toISOString() },
      });
      return { ...token, token: raw, schoolId, warning: 'This token is shown once and cannot be retrieved again.' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async revokeEnrollmentToken(schoolId: string, tokenId: string, operatorId: string, value: unknown, context: PlatformActionContext, now = new Date()) {
    const internalReason = z.object({ internalReason: reason }).strict().parse(value).internalReason;
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.schoolEnrollmentToken.findUnique({
        where: { id: tokenId },
        select: { id: true, customerSchoolId: true, consumedAt: true, revokedAt: true },
      });
      if (!token || token.customerSchoolId !== schoolId) throw new HttpError(404, 'Enrollment token not found for this school');
      if (token.consumedAt) throw new HttpError(409, 'A consumed enrollment token cannot be revoked');
      if (token.revokedAt) return { id: token.id, revokedAt: token.revokedAt };

      const revoked = await tx.schoolEnrollmentToken.update({ where: { id: tokenId }, data: { revokedAt: now }, select: { id: true, revokedAt: true } });
      await this.audit(tx, operatorId, context, {
        action: 'school_enrollment_token_revoked', targetId: schoolId, reason: internalReason, metadata: { tokenId },
      });
      return revoked;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Binds an installation that registered before this directory existed.
   *
   * Without it, every school already in production would be permanently unnamed — the claim path
   * only runs at registration, and re-registering would mean rotating a school's identity key for
   * a bookkeeping reason.
   */
  async adoptInstallation(schoolId: string, operatorId: string, value: unknown, context: PlatformActionContext) {
    const input = adoptInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const school = await tx.customerSchool.findUnique({
        where: { id: schoolId },
        select: { id: true, status: true, installation: { select: { id: true } } },
      });
      if (!school) throw new HttpError(404, 'Customer school not found');
      if (school.status === 'TERMINATED') throw new HttpError(409, 'A terminated school cannot adopt an installation');
      if (school.installation) throw new HttpError(409, 'This school already has a registered installation');

      const registration = await tx.installationRegistration.findUnique({
        where: { installationId: input.installationId },
        select: { id: true, installationId: true, label: true, customerSchoolId: true },
      });
      if (!registration) throw new HttpError(404, 'No installation is registered with that installation id');
      if (registration.customerSchoolId && registration.customerSchoolId !== schoolId) {
        throw new HttpError(409, 'That installation already belongs to another customer school');
      }

      await tx.installationRegistration.update({ where: { id: registration.id }, data: { customerSchoolId: schoolId } });
      const updated = await tx.customerSchool.update({
        where: { id: schoolId },
        data: { status: 'ACTIVE' },
        select: SCHOOL_SELECT,
      });
      await this.audit(tx, operatorId, context, {
        action: 'customer_school_installation_adopted', targetId: schoolId, reason: input.internalReason,
        metadata: { installationId: registration.installationId, registrationId: registration.id, previousLabel: registration.label },
      });
      return { ...updated, contactEmail: maskEmail(updated.contactEmail) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    operatorId: string,
    context: PlatformActionContext,
    entry: { action: string; targetId: string; reason: string; metadata?: Prisma.InputJsonValue },
  ) {
    await tx.platformAuditEvent.create({
      data: {
        operatorId, action: entry.action, success: true,
        targetType: 'CustomerSchool', targetId: entry.targetId, reason: entry.reason,
        metadata: entry.metadata, correlationId: context.correlationId, ip: context.ip, userAgent: context.userAgent,
      },
    });
  }
}
