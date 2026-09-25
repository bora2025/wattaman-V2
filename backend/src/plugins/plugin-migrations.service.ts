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

// Academic Management 0.1.0 shipped these migrations before identity headers
// became mandatory. Their exact published bytes remain immutable; only these
// plugin/migration/checksum triples may use the legacy format.
const LEGACY_HEADERLESS_MIGRATIONS = new Map<string, string>([
  ['wattanam.academic-management:003_create_enrollment_interval', '6a7304a8ea29c064a394144ba0fa4aa9288e62fabe03a9f0a81224401d969861'],
  ['wattanam.academic-management:004_create_study_year', '54a0a91809e5ad924484776f47c8b7638b6d1894bff379f1485c229f25fb0ac1'],
  ['wattanam.academic-management:005_create_class', '9d10a96010801a827f947e0f04a1fedb8a4eb59e3be3b742e51a7e1d53ea9b9c'],
  ['wattanam.academic-management:006_create_class_registration', 'a6eaa58785201a91f2236dbbe777eb7900600e71eb193c9052b99a860f53ce67'],
  ['wattanam.academic-management:007_create_class_registration_settings', 'f7fac966cf3f0d9156898a3a297e7a17747d50a77090af8c85634449a2ba734f'],
  ['wattanam.academic-management:008_create_class_registration_field', 'b550055dd6951c330f7f8fb0719fb2bfef722c0066486c8a3a2f64946caffa18'],
  ['wattanam.attendance-manager:001_create_attendance_manager', 'd02277c13ddbf7b0237f7059fb389f3fef36184edbfb907ff536515ef0b69233'],
]);

function isChecksumPinnedLegacyMigration(manifest: PluginManifest, migrationId: string, sql: string) {
  const declaredChecksum = manifest.migrations?.find((migration) => migration.id === migrationId)?.checksum;
  const actualChecksum = createHash('sha256').update(sql, 'utf8').digest('hex');
  const legacyChecksum = LEGACY_HEADERLESS_MIGRATIONS.get(`${manifest.id}:${migrationId}`);
  return Boolean(legacyChecksum && declaredChecksum === legacyChecksum && actualChecksum === legacyChecksum);
}

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
      if (isChecksumPinnedLegacyMigration(verified.manifest, migration.id, sql) && (sql.match(/;/g) || []).length > 1) {
        // Only the exact published Attendance Manager migration reaches this path. Executing its
        // simple DDL statements individually avoids PostgreSQL prepared-statement restrictions,
        // while the surrounding plugin-install transaction remains atomic.
        for (const statement of sql.split(';').map((value) => value.trim()).filter(Boolean)) {
          await tx.$executeRawUnsafe(`${statement};`);
        }
      } else {
        await tx.$executeRawUnsafe(sql);
      }
      await tx.pluginMigration.create({ data: {
        pluginId: verified.manifest.id, migrationId: migration.id, pluginVersion: verified.manifest.version,
        checksum, destructive: migration.destructive,
      } });
    }
  }

  validateSql(manifest: PluginManifest, migrationId: string, sql: string, destructive = false) {
    let checksumPinnedLegacyFormat = false;
    if (!sql.trim().startsWith(`-- wattanam-plugin-migration: ${migrationId}`)) {
      if (!isChecksumPinnedLegacyMigration(manifest, migrationId, sql)) {
        throw new BadRequestException(`Migration ${migrationId} is missing its identity header`);
      }
      checksumPinnedLegacyFormat = true;
    }
    assertNoForbiddenSql(sql, `Migration ${migrationId}`);
    if (!destructive && /\b(DROP\s+TABLE|TRUNCATE\b|ALTER\s+TABLE[\s\S]*?DROP\b)/i.test(sql)) throw new BadRequestException(`Migration ${migrationId} contains an undeclared destructive operation`);
    if (!checksumPinnedLegacyFormat && (sql.match(/;/g) || []).length > 1) throw new BadRequestException(`Migration ${migrationId} must contain exactly one SQL statement`);
    assertPluginNamespace(manifest.id, sql, `Migration ${migrationId}`);
    if (Buffer.byteLength(sql) > 1024 * 1024) throw new BadRequestException(`Migration ${migrationId} exceeds 1 MiB`);
  }
}
