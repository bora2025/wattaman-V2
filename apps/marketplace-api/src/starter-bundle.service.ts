import { Prisma, PrismaClient } from '@prisma/client';
import semver from 'semver';
import { z } from 'zod';
import { HttpError } from './http-error';
import { PlatformActionContext } from './platform-context';

type OperatorAction = { operatorId: string; reason: string; context: PlatformActionContext };

const bundleItem = z.object({
  pluginId: z.string().min(1).max(100),
  versionRange: z.string().refine((value) => semver.validRange(value) !== null, 'Invalid plugin version range'),
  required: z.boolean().default(true),
}).strict();

const createBundleInput = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  items: z.array(bundleItem).min(1).max(50),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.pluginId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Duplicate bundle plugins are not allowed' });
});

const bundleInclude = {
  items: {
    orderBy: [{ position: 'asc' as const }, { pluginId: 'asc' as const }],
    include: {
      plugin: {
        include: {
          publisher: { select: { slug: true, displayName: true } },
          prices: { orderBy: { amountMinor: 'asc' as const } },
          versions: {
            where: { reviewStatus: 'APPROVED' as const, channel: 'STABLE' as const, withdrawnAt: null },
            orderBy: { publishedAt: 'desc' as const },
            include: { artifact: { select: { sha256: true } } },
          },
        },
      },
    },
  },
};

export class StarterBundleService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(value: unknown, actor?: OperatorAction) {
    const input = createBundleInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const plugins = await tx.marketplacePlugin.findMany({
        where: { id: { in: input.items.map((item) => item.pluginId) } }, select: { id: true },
      });
      if (plugins.length !== input.items.length) throw new HttpError(400, 'One or more bundle plugins do not exist');
      const created = await tx.starterBundle.create({
        data: {
          slug: input.slug, name: input.name, description: input.description,
          items: { create: input.items.map((item, position) => ({ ...item, position })) },
        },
        include: bundleInclude,
      });
      if (actor) await this.audit(tx, actor, 'starter_bundle_created', created.id, { slug: created.slug });
      return created;
    });
  }

  async publish(bundleId: string, actor?: OperatorAction) {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.starterBundle.findUnique({ where: { id: bundleId }, include: bundleInclude });
      if (!bundle) throw new HttpError(404, 'Starter bundle not found');
      for (const item of bundle.items) {
        if (item.plugin.status !== 'APPROVED') throw new HttpError(409, `Bundle plugin is not approved: ${item.pluginId}`);
        const release = item.plugin.versions.find((version) => semver.satisfies(version.version, item.versionRange) && !!version.artifact);
        if (!release) throw new HttpError(409, `Bundle plugin has no approved Stable artifact matching ${item.versionRange}: ${item.pluginId}`);
      }
      const published = await tx.starterBundle.update({ where: { id: bundleId }, data: { status: 'APPROVED' }, include: bundleInclude });
      if (actor) await this.audit(tx, actor, 'starter_bundle_published', bundleId, { slug: bundle.slug });
      return published;
    });
  }

  async withdraw(bundleId: string, actor?: OperatorAction) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.starterBundle.findUnique({ where: { id: bundleId }, select: { id: true, slug: true } });
      if (!existing) throw new HttpError(404, 'Starter bundle not found');
      const withdrawn = await tx.starterBundle.update({ where: { id: bundleId }, data: { status: 'WITHDRAWN' } });
      if (actor) await this.audit(tx, actor, 'starter_bundle_withdrawn', bundleId, { slug: existing.slug });
      return withdrawn;
    });
  }

  adminList() {
    return this.prisma.starterBundle.findMany({ orderBy: { createdAt: 'desc' }, include: bundleInclude });
  }

  async catalog(coreVersion?: string, currency?: string, now = new Date()) {
    if (coreVersion && !semver.valid(coreVersion)) throw new HttpError(400, 'coreVersion must be semantic versioning');
    if (currency && !/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'currency must be a 3-letter ISO code');
    const bundles = await this.prisma.starterBundle.findMany({
      where: { status: 'APPROVED' }, orderBy: { name: 'asc' }, include: bundleInclude,
    });
    return bundles.map((bundle) => ({
      id: bundle.id, slug: bundle.slug, name: bundle.name, description: bundle.description,
      plugins: bundle.items.map((item) => {
        const releases = item.plugin.versions.filter((version) =>
          semver.satisfies(version.version, item.versionRange)
          && (!coreVersion || semver.satisfies(coreVersion, version.requiresCore))
          && !!version.artifact,
        );
        const prices = item.plugin.prices.filter((price) =>
          (!currency || price.currency === currency)
          && price.validFrom <= now && (!price.validUntil || price.validUntil > now),
        );
        return {
          pluginId: item.pluginId, name: item.plugin.name, publisher: item.plugin.publisher,
          required: item.required, versionRange: item.versionRange, paid: item.plugin.isPaid,
          compatible: releases.length > 0,
          version: releases[0]?.version,
          price: prices[0] ? { id: prices[0].id, currency: prices[0].currency, amountMinor: prices[0].amountMinor } : undefined,
        };
      }),
    }));
  }

  private async audit(tx: Prisma.TransactionClient, actor: OperatorAction, action: string, targetId: string, metadata: Prisma.InputJsonValue) {
    if (actor.reason.trim().length < 3) throw new HttpError(400, 'internalReason must contain at least 3 characters');
    await tx.platformAuditEvent.create({ data: {
      operatorId: actor.operatorId, action, targetType: 'StarterBundle', targetId,
      reason: actor.reason.trim(), metadata, correlationId: actor.context.correlationId,
      ip: actor.context.ip, userAgent: actor.context.userAgent,
    } });
  }
}
