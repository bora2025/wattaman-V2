import { createHash } from 'crypto';
import { PluginMigrationsService } from './plugin-migrations.service';

const sql = Buffer.from('-- wattanam-plugin-migration: 001\nCREATE TABLE "plugin_wattanam_test_records" ("id" TEXT PRIMARY KEY);');
const checksum = createHash('sha256').update(sql).digest('hex');
const verified: any = {
  manifest: { id: 'wattanam.test', version: '1.0.0', migrations: [{ id: '001', path: 'migrations/001.sql', checksum, destructive: false }] },
  files: new Map([['migrations/001.sql', sql]]),
};

describe('PluginMigrationsService', () => {
  it('executes and records a new immutable namespaced migration', async () => {
    const tx = { pluginMigration: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) }, $executeRawUnsafe: jest.fn().mockResolvedValue(0) } as any;
    await new PluginMigrationsService().apply(tx, verified);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(sql.toString());
    expect(tx.pluginMigration.create).toHaveBeenCalledWith({ data: expect.objectContaining({ pluginId: 'wattanam.test', migrationId: '001', checksum }) });
  });

  it('skips an already applied identical migration and rejects changed history', async () => {
    const service = new PluginMigrationsService();
    const tx = { pluginMigration: { findUnique: jest.fn().mockResolvedValue({ checksum }), create: jest.fn() }, $executeRawUnsafe: jest.fn() } as any;
    await service.apply(tx, verified);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    tx.pluginMigration.findUnique.mockResolvedValue({ checksum: 'a'.repeat(64) });
    await expect(service.apply(tx, verified)).rejects.toThrow('immutable');
  });

  it('rejects access to core tables, transaction control, and undeclared destructive SQL', () => {
    const service = new PluginMigrationsService();
    const manifest: any = { id: 'wattanam.test' };
    expect(() => service.validateSql(manifest, '001', '-- wattanam-plugin-migration: 001\nDROP TABLE "User";', true)).toThrow('only access');
    expect(() => service.validateSql(manifest, '001', '-- wattanam-plugin-migration: 001\nBEGIN;')).toThrow('forbidden');
    expect(() => service.validateSql(manifest, '001', '-- wattanam-plugin-migration: 001\nDROP TABLE "plugin_wattanam_test_records";')).toThrow('undeclared destructive');
  });
});
