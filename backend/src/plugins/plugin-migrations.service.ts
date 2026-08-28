import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import { VerifiedPluginPackage } from './plugin-package';
import { PluginManifest } from './plugin-manifest';
import { assertNoForbiddenSql, assertPluginNamespace } from './plugin-sql-guard';

const execFileAsync = promisify(execFile);

@Injectable()
export class PluginMigrationsService {
  async createRecoveryPoint() {
    if (process.env.NODE_ENV === 'test') return;
    const script = path.resolve(process.cwd(), 'scripts/backup-database.js');
    await execFileAsync(process.execPath, [script], { env: process.env, timeout: 5 * 60_000, maxBuffer: 1024 * 1024 });
  }

  async apply(tx: Prisma.TransactionClient, verified: VerifiedPluginPackage) {
    for (const migration of verified.manifest.migrations) {
      const content = verified.files.get(migration.path);
      if (!content) throw new BadRequestException(`Plugin migration file is missing: ${migration.path}`);
      const checksum = createHash('sha256').update(content).digest('hex');
      if (checksum !== migration.checksum) throw new BadRequestException(`Plugin migration checksum does not match manifest: ${migration.id}`);
      const existing = await tx.pluginMigration.findUnique({ where: { pluginId_migrationId: { pluginId: verified.manifest.id, migrationId: migration.id } } });
      if (existing) {
        if (existing.checksum !== checksum) throw new BadRequestException(`Applied plugin migration is immutable: ${migration.id}`);
        continue;
      }
      const sql = content.toString('utf8');
      this.validateSql(verified.manifest, migration.id, sql, migration.destructive);
      await tx.$executeRawUnsafe(sql);
      await tx.pluginMigration.create({ data: {
        pluginId: verified.manifest.id, migrationId: migration.id, pluginVersion: verified.manifest.version,
        checksum, destructive: migration.destructive,
      } });
    }
  }

  validateSql(manifest: PluginManifest, migrationId: string, sql: string, destructive = false) {
    if (!sql.trim().startsWith(`-- wattanam-plugin-migration: ${migrationId}`)) throw new BadRequestException(`Migration ${migrationId} is missing its identity header`);
    assertNoForbiddenSql(sql, `Migration ${migrationId}`);
    if (!destructive && /\b(DROP\s+TABLE|TRUNCATE\b|ALTER\s+TABLE[\s\S]*?DROP\b)/i.test(sql)) throw new BadRequestException(`Migration ${migrationId} contains an undeclared destructive operation`);
    if ((sql.match(/;/g) || []).length > 1) throw new BadRequestException(`Migration ${migrationId} must contain exactly one SQL statement`);
    assertPluginNamespace(manifest.id, sql, `Migration ${migrationId}`);
    if (Buffer.byteLength(sql) > 1024 * 1024) throw new BadRequestException(`Migration ${migrationId} exceeds 1 MiB`);
  }
}
