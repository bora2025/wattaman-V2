import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import semver from 'semver';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { readRuntimeConfig } from '../config/environment';
import { trustedPluginKeys } from './plugin-config';
import { PluginPackageVerifier, VerifiedPluginPackage } from './plugin-package';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginMigrationsService } from './plugin-migrations.service';

@Injectable()
export class PluginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: PluginPackageVerifier,
    private readonly runtime: PluginRuntimeService,
    private readonly migrations: PluginMigrationsService,
  ) {}

  async list() {
    return (await this.prisma.pluginInstallation.findMany({ orderBy: { name: 'asc' } })).map((plugin) => this.publicPlugin(plugin));
  }

  runtimeStatus() { return this.runtime.status(); }

  async inspect(packageBuffer: Buffer) {
    const verified = await this.verifier.verify(packageBuffer, trustedPluginKeys(), readRuntimeConfig().appVersion);
    await this.assertDependencies(verified);
    return {
      packageSha256: verified.packageSha256,
      plugin: {
        id: verified.manifest.id, name: verified.manifest.name, description: verified.manifest.description,
        version: verified.manifest.version, publisher: verified.manifest.publisher, requiresCore: verified.manifest.requiresCore,
        capabilities: verified.manifest.capabilities, permissions: verified.manifest.permissions,
        dependencies: verified.manifest.dependencies, migrations: verified.manifest.migrations.map(({ id, destructive }) => ({ id, destructive })),
        navigation: verified.manifest.navigation, supportUrl: verified.manifest.supportUrl, privacyUrl: verified.manifest.privacyUrl,
      },
    };
  }

  async install(packageBuffer: Buffer, confirmedPackageSha256?: string) {
    const coreVersion = readRuntimeConfig().appVersion;
    const verified = await this.verifier.verify(packageBuffer, trustedPluginKeys(), coreVersion);
    if (confirmedPackageSha256 !== undefined && confirmedPackageSha256 !== verified.packageSha256) throw new BadRequestException('The package differs from the inspected package');
    await this.assertDependencies(verified);
    const current = await this.prisma.pluginInstallation.findUnique({ where: { id: verified.manifest.id } });
    if (current?.status === 'active') {
      throw new ConflictException(`Deactivate ${verified.manifest.id} before installing an update`);
    }
    if (verified.manifest.migrations.length > 0) await this.migrations.createRecoveryPoint();

    const root = this.pluginRoot();
    const pluginRoot = path.join(root, verified.manifest.id);
    const destination = path.join(pluginRoot, verified.manifest.version);
    const staging = path.join(root, '.staging', `${verified.manifest.id}-${randomUUID()}`);
    await fs.mkdir(staging, { recursive: true, mode: 0o750 });
    try {
      for (const [name, content] of verified.files) {
        const target = path.resolve(staging, name);
        if (!target.startsWith(`${path.resolve(staging)}${path.sep}`)) throw new BadRequestException(`Unsafe extracted path: ${name}`);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
        await fs.writeFile(target, content, { mode: 0o640 });
      }
      await fs.mkdir(pluginRoot, { recursive: true, mode: 0o750 });
      try {
        await fs.access(destination);
        throw new ConflictException(`Plugin ${verified.manifest.id}@${verified.manifest.version} is already present`);
      } catch (error: any) {
        if (error instanceof ConflictException) throw error;
        if (error?.code !== 'ENOENT') throw error;
      }
      await fs.rename(staging, destination);
      try {
        const registered = await this.prisma.$transaction(async (tx) => {
          await this.migrations.apply(tx, verified);
          return tx.pluginInstallation.upsert({
            where: { id: verified.manifest.id },
            create: this.registryData(verified, destination),
            update: { ...this.registryData(verified, destination), status: 'installed', activatedAt: null, deactivatedAt: null, lastError: null },
          });
        });
        return this.publicPlugin(registered);
      } catch (error) {
        await fs.rm(destination, { recursive: true, force: true });
        throw error;
      }
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async activate(id: string) {
    const plugin = await this.get(id);
    const manifest = JSON.parse(plugin.manifestJson);
    await this.assertDependencies({ manifest } as VerifiedPluginPackage);
    await fs.access(plugin.installedPath);
    for (const entry of [manifest.backendEntry, manifest.frontendEntry].filter(Boolean)) {
      await fs.access(path.join(plugin.installedPath, entry));
    }
    const updated = await this.prisma.pluginInstallation.update({
      where: { id },
      data: { status: 'active', activatedAt: new Date(), deactivatedAt: null, lastError: null },
    });
    try {
      await this.runtime.load(id);
      return this.publicPlugin(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.pluginInstallation.update({ where: { id }, data: { status: 'failed', lastError: message } });
      throw error;
    }
  }

  async deactivate(id: string) {
    await this.get(id);
    await this.runtime.unload(id);
    return this.publicPlugin(await this.prisma.pluginInstallation.update({
      where: { id },
      data: { status: 'inactive', deactivatedAt: new Date() },
    }));
  }

  async remove(id: string) {
    const plugin = await this.get(id);
    if (plugin.status === 'active') throw new ConflictException(`Deactivate ${id} before removing it`);
    await this.runtime.unload(id);
    await this.prisma.pluginInstallation.delete({ where: { id } });
    const root = this.pluginRoot();
    const pluginRoot = path.resolve(root, id);
    if (!pluginRoot.startsWith(`${root}${path.sep}`)) throw new BadRequestException('Plugin removal path is unsafe');
    await fs.rm(pluginRoot, { recursive: true, force: true });
    return { id, status: 'removed', dataPreserved: true };
  }

  private async get(id: string) {
    const plugin = await this.prisma.pluginInstallation.findUnique({ where: { id } });
    if (!plugin) throw new NotFoundException(`Plugin not installed: ${id}`);
    return plugin;
  }

  private async assertDependencies(verified: Pick<VerifiedPluginPackage, 'manifest'>) {
    for (const [id, range] of Object.entries(verified.manifest.dependencies)) {
      const dependency = await this.prisma.pluginInstallation.findUnique({ where: { id } });
      if (!dependency || dependency.status !== 'active' || !semver.satisfies(dependency.version, range)) {
        throw new BadRequestException(`Plugin dependency is not active or compatible: ${id}@${range}`);
      }
    }
  }

  private registryData(verified: VerifiedPluginPackage, destination: string) {
    return {
      id: verified.manifest.id,
      name: verified.manifest.name,
      version: verified.manifest.version,
      publisher: verified.manifest.publisher,
      status: 'installed',
      manifestJson: JSON.stringify(verified.manifest),
      packageSha256: verified.packageSha256,
      installedPath: destination,
    };
  }

  private pluginRoot() {
    const root = path.resolve(process.env.PLUGIN_DIR || (process.env.NODE_ENV === 'production' ? '/data/plugins' : './plugins-installed'));
    if (root === path.parse(root).root) throw new BadRequestException('PLUGIN_DIR cannot be a filesystem root');
    return root;
  }

  private publicPlugin(plugin: any) {
    let manifest: any = {};
    try { manifest = JSON.parse(plugin.manifestJson); } catch { /* registry corruption is surfaced by status and activation */ }
    return {
      id: plugin.id,
      name: plugin.name,
      description: manifest.description || '',
      version: plugin.version,
      publisher: plugin.publisher,
      status: plugin.status,
      capabilities: manifest.capabilities || [],
      permissions: manifest.permissions || [],
      requiresCore: manifest.requiresCore || null,
      packageSha256: plugin.packageSha256,
      installedAt: plugin.installedAt,
      activatedAt: plugin.activatedAt,
      deactivatedAt: plugin.deactivatedAt,
      lastError: plugin.lastError,
    };
  }
}
