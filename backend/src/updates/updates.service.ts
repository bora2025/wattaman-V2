import { BadGatewayException, BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import semver from 'semver';
import { readRuntimeConfig } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { PluginsService } from '../plugins/plugins.service';
import { readUpdateRepositoryConfig } from './update-config';
import { verifyRepositoryEnvelope } from './repository-signature';

@Injectable()
export class UpdatesService {
  constructor(private readonly prisma: PrismaService, private readonly plugins: PluginsService) {}

  async check() {
    const config = readUpdateRepositoryConfig();
    if (!config) return { enabled: false, reason: 'MARKETPLACE_URL is not configured' };
    const coreVersion = readRuntimeConfig().appVersion;
    if (!semver.valid(coreVersion)) throw new ServiceUnavailableException('APP_VERSION must be semantic versioning before update checks can run');
    const payload = await this.index(config, coreVersion);
    const installed = await this.prisma.pluginInstallation.findMany();
    const pluginUpdates = installed.flatMap((plugin) => {
      const releases = payload.pluginReleases.filter((release: any) => release.pluginId === plugin.id && semver.valid(release.version) && semver.gt(release.version, plugin.version));
      const newest = releases.sort((a: any, b: any) => semver.rcompare(a.version, b.version))[0];
      return newest ? [{ pluginId: plugin.id, installedVersion: plugin.version, status: plugin.status, release: this.publicRelease(newest) }] : [];
    });
    const advisories = payload.advisories.filter((advisory: any) => {
      const plugin = installed.find((candidate) => candidate.id === advisory.pluginId);
      return plugin && semver.valid(plugin.version) && semver.validRange(advisory.affectedVersions) && semver.satisfies(plugin.version, advisory.affectedVersions);
    });
    const coreUpdates = payload.coreReleases
      .filter((release: any) => semver.valid(release.version) && semver.gt(release.version, coreVersion))
      .map((release: any) => {
        const blockers = installed.filter((plugin) => {
          if (plugin.status !== 'active') return false;
          try {
            const manifest = JSON.parse(plugin.manifestJson);
            return !semver.validRange(manifest.requiresCore) || !semver.satisfies(release.version, manifest.requiresCore);
          } catch { return true; }
        }).map((plugin) => plugin.id);
        return { ...release, blockedByActivePlugins: blockers };
      });
    return {
      enabled: true, repository: new URL(config.url).host, checkedAt: new Date().toISOString(),
      core: { installedVersion: coreVersion, updates: coreUpdates }, pluginUpdates, advisories,
    };
  }

  async installPlugin(pluginId: string, version: string) {
    const config = readUpdateRepositoryConfig();
    if (!config) throw new ServiceUnavailableException('Update repository is not configured');
    if (!semver.valid(version)) throw new BadRequestException('version must be semantic versioning');
    const coreVersion = readRuntimeConfig().appVersion;
    const payload = await this.index(config, coreVersion);
    const release = payload.pluginReleases.find((candidate: any) => candidate.pluginId === pluginId && candidate.version === version);
    if (!release) throw new NotFoundException('Compatible repository release not found');
    const download = new URL(release.downloadUrl);
    if (download.origin !== config.url || !download.pathname.startsWith('/v1/artifacts/')) throw new BadGatewayException('Repository returned an untrusted artifact URL');
    if (!/^[a-f0-9]{64}$/.test(release.sha256)) throw new BadGatewayException('Repository returned an invalid artifact checksum');
    const response = await this.fetchWithTimeout(download, 30_000);
    if (!response.ok) throw new BadGatewayException(`Artifact download failed (${response.status})`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > config.maximumArtifactBytes) throw new BadGatewayException('Artifact exceeds the configured size limit');
    if (!response.body) throw new BadGatewayException('Artifact response has no body');
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of response.body as any) {
      const bytes = Buffer.from(chunk);
      received += bytes.length;
      if (received > config.maximumArtifactBytes) throw new BadGatewayException('Artifact exceeds the configured size limit');
      chunks.push(bytes);
    }
    const buffer = Buffer.concat(chunks);
    const digest = createHash('sha256').update(buffer).digest('hex');
    if (digest !== release.sha256) throw new BadGatewayException('Downloaded artifact checksum does not match signed metadata');
    return this.plugins.install(buffer);
  }

  private async index(config: NonNullable<ReturnType<typeof readUpdateRepositoryConfig>>, coreVersion: string) {
    const url = new URL('/v1/index', config.url);
    url.searchParams.set('coreVersion', coreVersion);
    url.searchParams.set('channel', config.channel);
    const response = await this.fetchWithTimeout(url, 10_000);
    if (!response.ok) throw new BadGatewayException(`Update repository check failed (${response.status})`);
    let body: unknown;
    try { body = await response.json(); } catch { throw new BadGatewayException('Update repository returned invalid JSON'); }
    try { return verifyRepositoryEnvelope(body, config.publicKeys); }
    catch (error) { throw new BadGatewayException(error instanceof Error ? error.message : 'Repository signature validation failed'); }
  }

  private async fetchWithTimeout(url: URL, milliseconds: number) {
    try { return await fetch(url, { signal: AbortSignal.timeout(milliseconds), redirect: 'error', headers: { Accept: 'application/json, application/vnd.wattanam.plugin+zip' } }); }
    catch { throw new BadGatewayException('Update repository is unavailable'); }
  }

  private publicRelease(release: any) {
    return {
      pluginId: release.pluginId, name: release.name, version: release.version, publisher: release.publisher,
      requiresCore: release.requiresCore, channel: release.channel, paid: release.paid,
      changelog: release.changelog, sha256: release.sha256, sizeBytes: release.sizeBytes,
    };
  }
}
