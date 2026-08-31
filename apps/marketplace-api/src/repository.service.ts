import { Prisma, PrismaClient, ReleaseChannel } from '@prisma/client';
import { createHash } from 'node:crypto';
import { link, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import { HttpError } from './http-error';
import { verifyPluginPackage } from './package-verifier';
import { repositoryPublicKey, signEnvelopeWithKeys } from './signing';

const publisherInput = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(100),
  displayName: z.string().trim().min(1).max(120),
  keyId: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  publicKeyPem: z.string().includes('PUBLIC KEY'),
});

const releaseInput = z.object({
  channel: z.enum(['STABLE', 'BETA']).default('STABLE'),
  changelog: z.string().max(20_000).optional(),
  paid: z.enum(['true', 'false']).default('false'),
});

const advisoryInput = z.object({
  id: z.string().regex(/^WAT-[0-9]{4}-[0-9]{4,}$/),
  pluginId: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  severity: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']),
  affectedVersions: z.string().refine((value) => semver.validRange(value) !== null),
  fixedVersion: z.string().refine((value) => semver.valid(value) !== null).optional(),
  description: z.string().trim().min(1).max(10_000),
  recommendedAction: z.enum(['WARN', 'DISABLE', 'REMOVE']).default('WARN'),
  communicationUrl: z.string().url().optional(),
});

const withdrawalInput = advisoryInput.extend({
  version: z.string().refine((value) => semver.valid(value) !== null),
  channel: z.enum(['STABLE', 'BETA']).default('STABLE'),
  reason: z.string().trim().min(1).max(2000),
}).strict();

const coreReleaseInput = z.object({
  version: z.string().refine((value) => semver.valid(value) !== null),
  channel: z.enum(['STABLE', 'BETA']).default('STABLE'),
  nodeRange: z.string().refine((value) => semver.validRange(value) !== null),
  postgresRange: z.string().min(1).max(100),
  apiImage: z.string().regex(/^.+@sha256:[a-f0-9]{64}$/),
  webImage: z.string().regex(/^.+@sha256:[a-f0-9]{64}$/),
  gatewayImage: z.string().regex(/^.+@sha256:[a-f0-9]{64}$/),
  releaseNotes: z.string().min(1).max(50_000),
  migrationNotes: z.string().max(50_000).optional(),
});

const pluginPromotionInput = z.object({
  pluginId: z.string().min(1).max(100),
  version: z.string().refine((value) => semver.valid(value) !== null),
}).strict();

const corePromotionInput = z.object({ version: z.string().refine((value) => semver.valid(value) !== null) }).strict();

export class RepositoryService {
  constructor(private readonly prisma: PrismaClient, private readonly config: MarketplaceConfig) {}

  keyDocument() {
    return {
      schemaVersion: 1, activeKeyId: this.config.signingKeyId, algorithm: 'ed25519',
      keys: this.config.signingKeys.map((key) => ({ keyId: key.keyId, publicKeyPem: repositoryPublicKey(key.privateKey) })),
    };
  }

  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready', service: 'wattanam-marketplace-api', version: '0.1.0' };
  }

  async createOfficialPublisher(value: unknown) {
    const input = publisherInput.parse(value);
    return this.prisma.publisher.create({
      data: { slug: input.slug, displayName: input.displayName, status: 'VERIFIED', keys: { create: { keyId: input.keyId, publicKeyPem: input.publicKeyPem } } },
      select: { id: true, slug: true, displayName: true, status: true, createdAt: true },
    });
  }

  async publishPlugin(fields: unknown, packageBuffer: Buffer, reviewStatus: 'APPROVED' | 'IN_REVIEW' = 'APPROVED') {
    const input = releaseInput.parse(fields);
    if (input.paid === 'true') throw new HttpError(501, 'Paid publication is disabled until entitlement enforcement is operational');
    const packageHash = createHash('sha256').update(packageBuffer).digest('hex');
    const duplicate = await this.prisma.packageArtifact.findUnique({ where: { sha256: packageHash } });
    if (duplicate) throw new HttpError(409, 'This immutable artifact is already published');

    const publishers = await this.prisma.publisher.findMany({ where: { status: 'VERIFIED' }, include: { keys: { where: { revokedAt: null, OR: [{ approvedAt: { not: null } }, { publisher: { slug: 'wattanam' } }] } } } });
    const trustedPublishers = new Map(publishers.map((publisher) => [
      publisher.slug,
      new Map(publisher.keys.map((key) => [key.keyId, key.publicKeyPem])),
    ]));
    const verified = await verifyPluginPackage(packageBuffer, trustedPublishers, this.config.maxArtifactBytes);
    const publisher = publishers.find((candidate) => candidate.slug === verified.manifest.publisher && candidate.keys.some((key) => key.keyId === verified.publisherKeyId));
    if (!publisher) throw new HttpError(403, 'The package publisher is not verified');

    const storageKey = path.posix.join(verified.sha256.slice(0, 2), `${verified.sha256}.wtp`);
    const destination = path.join(this.config.artifactPath, ...storageKey.split('/'));
    const temporary = `${destination}.${process.pid}.${Date.now()}.partial`;
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await writeFile(temporary, packageBuffer, { flag: 'wx', mode: 0o640 });
      await link(temporary, destination);
      await unlink(temporary);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plugin = await tx.marketplacePlugin.upsert({
          where: { id: verified.manifest.id },
          create: {
            id: verified.manifest.id, publisherId: publisher.id, name: verified.manifest.name,
            description: verified.manifest.description, license: verified.manifest.license,
            isPaid: input.paid === 'true', status: reviewStatus,
          },
          update: {
            name: verified.manifest.name, description: verified.manifest.description,
            license: verified.manifest.license, isPaid: input.paid === 'true', status: reviewStatus,
          },
        });
        if (plugin.publisherId !== publisher.id) throw new HttpError(409, 'Plugin id belongs to another publisher');
        const version = await tx.pluginVersion.create({
          data: {
            pluginId: plugin.id, version: verified.manifest.version, requiresCore: verified.manifest.requiresCore,
            channel: input.channel, reviewStatus, manifestJson: verified.manifest as Prisma.InputJsonValue,
            changelog: input.changelog, publishedAt: reviewStatus === 'APPROVED' ? new Date() : null,
            artifact: { create: { sha256: verified.sha256, sizeBytes: verified.sizeBytes, storageKey, publisherKeyId: verified.publisherKeyId } },
          },
          include: { artifact: true },
        });
        return { pluginId: plugin.id, pluginVersionId: version.id, version: version.version, channel: version.channel, sha256: version.artifact!.sha256, analysisSignals: verified.analysisSignals };
      });
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  }

  async publishCoreRelease(value: unknown) {
    const input = coreReleaseInput.parse(value);
    return this.prisma.coreRelease.create({ data: input });
  }

  async publishAdvisory(value: unknown) {
    const input = advisoryInput.parse(value);
    return this.prisma.securityAdvisory.create({ data: input });
  }

  async withdrawPluginRelease(value: unknown) {
    const input = withdrawalInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const release = await tx.pluginVersion.findUnique({ where: { pluginId_version_channel: { pluginId: input.pluginId, version: input.version, channel: input.channel } } });
      if (!release) throw new HttpError(404, 'Plugin release not found');
      if (release.withdrawnAt) throw new HttpError(409, 'Plugin release is already withdrawn');
      const withdrawnAt = new Date();
      await tx.pluginVersion.update({ where: { id: release.id }, data: { withdrawnAt, reviewStatus: 'WITHDRAWN' } });
      const advisory = await tx.securityAdvisory.create({ data: {
        id: input.id, pluginId: input.pluginId, title: input.title, severity: input.severity,
        affectedVersions: input.affectedVersions, fixedVersion: input.fixedVersion, description: input.description,
        recommendedAction: input.recommendedAction, communicationUrl: input.communicationUrl,
      } });
      await tx.versionReview.create({ data: { pluginVersionId: release.id, status: 'WITHDRAWN', reviewer: 'security-incident', notes: input.reason, reviewedAt: withdrawnAt } });
      return { pluginId: input.pluginId, version: input.version, channel: input.channel, withdrawnAt, advisory };
    });
  }

  async promotePluginRelease(value: unknown) {
    const input = pluginPromotionInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const beta = await tx.pluginVersion.findUnique({
        where: { pluginId_version_channel: { pluginId: input.pluginId, version: input.version, channel: 'BETA' } },
        include: { artifact: true },
      });
      if (!beta?.artifact || beta.reviewStatus !== 'APPROVED' || beta.withdrawnAt) throw new HttpError(404, 'Promotable beta plugin release not found');
      const stable = await tx.pluginVersion.findUnique({ where: { pluginId_version_channel: { pluginId: input.pluginId, version: input.version, channel: 'STABLE' } } });
      if (stable) throw new HttpError(409, 'Stable plugin release already exists');
      const promoted = await tx.pluginVersion.update({ where: { id: beta.id }, data: { channel: 'STABLE' }, include: { artifact: true } });
      return { pluginId: promoted.pluginId, version: promoted.version, channel: promoted.channel, sha256: promoted.artifact!.sha256, rebuilt: false };
    });
  }

  async promoteCoreRelease(value: unknown) {
    const input = corePromotionInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const beta = await tx.coreRelease.findUnique({ where: { version_channel: { version: input.version, channel: 'BETA' } } });
      if (!beta || beta.withdrawnAt) throw new HttpError(404, 'Promotable beta core release not found');
      const stable = await tx.coreRelease.findUnique({ where: { version_channel: { version: input.version, channel: 'STABLE' } } });
      if (stable) throw new HttpError(409, 'Stable core release already exists');
      const promoted = await tx.coreRelease.update({ where: { id: beta.id }, data: { channel: 'STABLE' } });
      return { version: promoted.version, channel: promoted.channel, images: { api: promoted.apiImage, web: promoted.webImage, gateway: promoted.gatewayImage }, rebuilt: false };
    });
  }

  async signedIndex(coreVersion: string, requestedChannel: string) {
    if (!semver.valid(coreVersion)) throw new HttpError(400, 'coreVersion must be semantic versioning');
    const channel = requestedChannel.toUpperCase();
    if (!['STABLE', 'BETA'].includes(channel)) throw new HttpError(400, 'channel must be stable or beta');
    const allowedChannels: ReleaseChannel[] = channel === 'BETA' ? ['STABLE', 'BETA'] : ['STABLE'];
    const [versions, coreReleases, advisories] = await Promise.all([
      this.prisma.pluginVersion.findMany({
        where: { reviewStatus: 'APPROVED', withdrawnAt: null, channel: { in: allowedChannels }, plugin: { status: 'APPROVED' } },
        include: { artifact: true, plugin: { include: { publisher: { include: { keys: { where: { revokedAt: null } } } } } } },
      }),
      this.prisma.coreRelease.findMany({ where: { withdrawnAt: null, channel: { in: allowedChannels } } }),
      this.prisma.securityAdvisory.findMany({ where: { withdrawnAt: null }, orderBy: { publishedAt: 'desc' } }),
    ]);
    const releases = versions
      .filter((item) => item.artifact && semver.satisfies(coreVersion, item.requiresCore))
      .sort((a, b) => a.pluginId.localeCompare(b.pluginId) || semver.rcompare(a.version, b.version))
      .map((item) => ({
        pluginId: item.pluginId, name: item.plugin.name, description: item.plugin.description,
        publisher: item.plugin.publisher.slug, version: item.version, requiresCore: item.requiresCore,
        channel: item.channel.toLowerCase(), paid: item.plugin.isPaid, manifest: item.manifestJson,
        changelog: item.changelog, sha256: item.artifact!.sha256, sizeBytes: item.artifact!.sizeBytes,
        downloadUrl: `${this.config.publicBaseUrl}/v1/artifacts/${item.artifact!.sha256}`,
        // Lets a school safely learn a new publisher's signing key straight from this
        // already-signed index, exactly the same trust delegation update-checking already relies
        // on -- omitted (undefined) if the key that signed this artifact was since revoked, so a
        // revoked key can never be re-trusted this way.
        publisherKeyId: item.artifact!.publisherKeyId,
        publisherPublicKeyPem: item.plugin.publisher.keys.find((key) => key.keyId === item.artifact!.publisherKeyId)?.publicKeyPem,
      }));
    const payload = {
      schemaVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      requested: { coreVersion, channel: channel.toLowerCase() },
      coreReleases: coreReleases.sort((a, b) => semver.rcompare(a.version, b.version)).map((item) => ({
        version: item.version, channel: item.channel.toLowerCase(), nodeRange: item.nodeRange,
        postgresRange: item.postgresRange, images: { api: item.apiImage, web: item.webImage, gateway: item.gatewayImage },
        releaseNotes: item.releaseNotes, migrationNotes: item.migrationNotes, publishedAt: item.publishedAt.toISOString(),
      })),
      pluginReleases: releases,
      advisories: advisories.map((item) => ({
        id: item.id, pluginId: item.pluginId, title: item.title, severity: item.severity.toLowerCase(),
        affectedVersions: item.affectedVersions, fixedVersion: item.fixedVersion,
        description: item.description, recommendedAction: item.recommendedAction.toLowerCase(),
        communicationUrl: item.communicationUrl, publishedAt: item.publishedAt.toISOString(),
      })),
    };
    return signEnvelopeWithKeys(payload, this.config.signingKeys);
  }

  async artifact(sha256: string) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new HttpError(404, 'Artifact not found');
    const artifact = await this.prisma.packageArtifact.findUnique({ where: { sha256 }, include: { pluginVersion: { include: { plugin: true } } } });
    if (!artifact || artifact.pluginVersion.reviewStatus !== 'APPROVED' || artifact.pluginVersion.withdrawnAt || artifact.pluginVersion.plugin.status !== 'APPROVED') {
      throw new HttpError(404, 'Artifact not found');
    }
    return { path: path.join(this.config.artifactPath, ...artifact.storageKey.split('/')), artifact };
  }

  async recordDownload(pluginVersionId: string, artifactSha256: string, installationId?: string) {
    await this.prisma.downloadEvent.create({ data: { pluginVersionId, artifactSha256, installationId } });
  }
}
