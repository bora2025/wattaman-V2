import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import semver from 'semver';
import { z } from 'zod';
import { CommerceService } from './commerce.service';
import { HttpError } from './http-error';

const checkoutInput = z.object({
  installationId: z.string().uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  priceIds: z.array(z.string().uuid()).min(1).max(50), idempotencyKey: z.string().min(16).max(200),
  /** INVOICE bills the school's next subscription invoice; the entitlement is granted now. */
  settlementMode: z.enum(['IMMEDIATE', 'INVOICE']).default('IMMEDIATE'),
}).strict();

export class CustomerMarketplaceService {
  constructor(private readonly prisma: PrismaClient, private readonly commerce: CommerceService) {}

  async catalog(coreVersion?: string, accountId?: string, now = new Date()) {
    if (coreVersion && !semver.valid(coreVersion)) throw new HttpError(400, 'coreVersion must be semantic versioning');
    const plugins = await this.prisma.marketplacePlugin.findMany({
      where: { status: 'APPROVED' },
      include: {
        publisher: { select: { slug: true, displayName: true } },
        prices: { where: { validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, orderBy: { amountMinor: 'asc' } },
        versions: { where: { reviewStatus: 'APPROVED', channel: 'STABLE', withdrawnAt: null }, orderBy: { publishedAt: 'desc' }, include: { artifact: { select: { sha256: true, sizeBytes: true } } } },
        entitlements: accountId ? { where: { installation: { accountId } }, select: { status: true, expiresAt: true, updatesThrough: true, installation: { select: { installationId: true, label: true } } } } : false,
      },
    });
    return plugins.map((plugin) => {
      const compatibleVersions = plugin.versions.filter((version) => !coreVersion || semver.satisfies(coreVersion, version.requiresCore));
      return {
        id: plugin.id, name: plugin.name, description: plugin.description, license: plugin.license, paid: plugin.isPaid,
        publisher: plugin.publisher, prices: plugin.prices.map((price) => ({ id: price.id, currency: price.currency, amountMinor: price.amountMinor, licensedMajor: price.licensedMajor, updatesDays: price.updatesDays, licenseDays: price.licenseDays })),
        versions: compatibleVersions.map((version) => ({
          version: version.version, requiresCore: version.requiresCore, changelog: version.changelog,
          publishedAt: version.publishedAt, sha256: version.artifact?.sha256,
          sizeBytes: version.artifact?.sizeBytes,
          ...publicInstallDisclosure(version.manifestJson),
        })),
        compatible: compatibleVersions.length > 0,
        ownership: accountId ? (plugin.entitlements as any[]).map((item) => ({ installationId: item.installation.installationId, installationLabel: item.installation.label, status: item.status, expiresAt: item.expiresAt, updatesThrough: item.updatesThrough })) : undefined,
      };
    });
  }

  async checkout(accountId: string, value: unknown) {
    const input = checkoutInput.parse(value);
    const installation = await this.prisma.installationRegistration.findUnique({ where: { installationId: input.installationId }, select: { id: true, accountId: true, school: { select: { status: true } } } });
    if (!installation || installation.accountId !== accountId) throw new HttpError(403, 'Installation is not registered to this account');
    if (installation.school && installation.school.status !== 'ACTIVE') throw new HttpError(403, 'Customer school is not active');
    return this.commerce.createOrder({ accountId, installationId: installation.id, currency: input.currency, priceIds: input.priceIds, idempotencyKey: input.idempotencyKey, settlementMode: input.settlementMode });
  }

  orders(accountId: string) {
    return this.prisma.marketplaceOrder.findMany({
      where: { accountId }, orderBy: { createdAt: 'desc' },
      include: { installation: { select: { installationId: true, label: true } }, lines: { include: { plugin: { select: { id: true, name: true } }, entitlement: { select: { status: true, expiresAt: true, updatesThrough: true } } } }, payments: { select: { provider: true, status: true, createdAt: true } } },
    });
  }

  entitlements(accountId: string) {
    return this.prisma.installationEntitlement.findMany({
      where: { installation: { accountId } }, orderBy: { createdAt: 'desc' },
      select: { pluginId: true, status: true, expiresAt: true, updatesThrough: true, offlineUntil: true, signedToken: true, installation: { select: { installationId: true, label: true } }, plugin: { select: { name: true } } },
    });
  }

  async authorizeAccountDownload(accountId: string, pluginId: string, now = new Date()) {
    const entitlement = await this.prisma.installationEntitlement.findFirst({ where: { pluginId, status: 'ACTIVE', installation: { accountId, OR: [{ school: null }, { school: { status: 'ACTIVE' } }] }, expiresAt: { gt: now }, updatesThrough: { gte: now } } });
    if (!entitlement) throw new HttpError(403, 'An active entitlement with update access is required');
    return entitlement.installationId;
  }
}

/**
 * Expose only the signed manifest fields a school owner needs to make an install decision. The
 * complete manifest remains repository metadata; entry paths and other packaging internals do not
 * belong in the customer catalog response. Removal currently has one safe core policy: files are
 * removed while settings, migrations, storage and business data are preserved for reinstall.
 */
function publicInstallDisclosure(value: unknown) {
  const manifest = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const strings = (candidate: unknown) => Array.isArray(candidate)
    ? [...new Set(candidate.filter((item): item is string => typeof item === 'string'))]
    : [];
  const ranges = (candidate: unknown) => candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? Object.fromEntries(Object.entries(candidate as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {};
  const migrations = Array.isArray(manifest.migrations) ? manifest.migrations : [];
  const sortedRanges = (candidate: unknown) => Object.fromEntries(Object.entries(ranges(candidate)).sort(([left], [right]) => left.localeCompare(right)));
  const disclosure = {
    capabilities: strings(manifest.capabilities).sort(),
    permissions: strings(manifest.permissions).sort(),
    dependencies: sortedRanges(manifest.dependencies),
    optionalDependencies: sortedRanges(manifest.optionalDependencies),
    migrationSummary: {
      count: migrations.length,
      destructive: migrations.some((item) => !!item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).destructive === true),
    },
    dataRetention: { onDeactivate: 'preserve', onRemove: 'preserve', onReinstall: 'adopt' },
  };
  return {
    ...disclosure,
    consentDigest: createHash('sha256').update(JSON.stringify(disclosure)).digest('hex'),
  };
}
