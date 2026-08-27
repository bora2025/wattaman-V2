import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { BackupService } from './backup.service';

describe('BackupService', () => {
  const originalEnvironment = process.env;
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wattanam-backup-test-'));
    process.env = { ...originalEnvironment, BACKUP_DIR: directory };
  });

  afterEach(async () => {
    process.env = originalEnvironment;
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('reports configured storage with no backups', async () => {
    await expect(new BackupService().status()).resolves.toEqual(expect.objectContaining({
      strategy: 'postgresql-native', configured: true, backupCount: 0, latest: null,
    }));
  });

  it('returns the newest valid manifest and ignores malformed files', async () => {
    const oldManifest = { format: 'pg_dump-custom-v1', createdAt: '2026-01-01T00:00:00.000Z', file: 'old.dump', sizeBytes: 12, sha256: 'old' };
    const latestManifest = { format: 'pg_dump-custom-v1', createdAt: '2026-08-27T00:00:00.000Z', file: 'new.dump', sizeBytes: 42, sha256: 'new', installationSlug: 'test-school' };
    await Promise.all([
      fs.writeFile(path.join(directory, 'wattanam-old.manifest.json'), JSON.stringify(oldManifest)),
      fs.writeFile(path.join(directory, 'wattanam-new.manifest.json'), JSON.stringify(latestManifest)),
      fs.writeFile(path.join(directory, 'wattanam-broken.manifest.json'), '{broken'),
    ]);

    const status = await new BackupService().status();
    expect(status.backupCount).toBe(2);
    expect(status.latest).toEqual(expect.objectContaining({ file: 'new.dump', installationSlug: 'test-school' }));
  });

  it('does not expose the configured filesystem path', async () => {
    const serialized = JSON.stringify(await new BackupService().status());
    expect(serialized).not.toContain(directory);
  });
});

