import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';

interface BackupManifest {
  format: string;
  createdAt: string;
  file: string;
  sizeBytes: number;
  sha256: string;
  installationSlug?: string | null;
  appVersion?: string | null;
}

@Injectable()
export class BackupService {
  private backupDirectory() {
    return path.resolve(process.env.BACKUP_DIR || (process.env.NODE_ENV === 'production' ? '/data/backups' : './backups'));
  }

  async status() {
    const directory = this.backupDirectory();
    try {
      const names = await fs.readdir(directory);
      const manifests: BackupManifest[] = [];
      for (const name of names.filter((item) => /^wattanam-.*\.manifest\.json$/.test(item))) {
        try {
          const parsed = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as BackupManifest;
          if (parsed.format === 'pg_dump-custom-v1' && parsed.createdAt && parsed.file) manifests.push(parsed);
        } catch {
          // Invalid manifests are ignored and remain available for operator investigation.
        }
      }
      manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = manifests[0] || null;
      return {
        strategy: 'postgresql-native',
        configured: true,
        backupCount: manifests.length,
        latest: latest ? {
          createdAt: latest.createdAt,
          file: latest.file,
          sizeBytes: latest.sizeBytes,
          sha256: latest.sha256,
          installationSlug: latest.installationSlug || null,
          appVersion: latest.appVersion || null,
        } : null,
        restoreMode: 'offline-cli-only',
      };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return { strategy: 'postgresql-native', configured: false, backupCount: 0, latest: null, restoreMode: 'offline-cli-only' };
      }
      throw error;
    }
  }
}

