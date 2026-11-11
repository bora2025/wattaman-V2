import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { backup, configuration, decrypt, dumpDatabase, encrypt, pgEnvironment } = require('../scripts/offsite-backup');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchSet } = require('../scripts/fetch-offsite-backup');

function memoryStorage() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    put: async (key: string, body: Buffer) => { objects.set(key, Buffer.from(body)); },
    get: async (key: string) => objects.get(key) ?? null,
    list: async (prefix: string) => [...objects.keys()].filter((key) => key.startsWith(prefix)),
    remove: async (key: string) => { objects.delete(key); },
  };
}

const key = randomBytes(32);
const dump = (text = 'customer accounts and entitlements') => ({ bytes: Buffer.from(text), tables: 42 });

describe('marketplace off-site backup', () => {
  it('uploads an encrypted set and the restore script recovers identical bytes', async () => {
    const storage = memoryStorage();
    const result = await backup({ storage, key, retentionDays: 35, dump: dump(), now: new Date('2026-11-10T02:15:00Z') });
    for (const value of storage.objects.values()) if (value.subarray(0, 6).toString() === 'WTNOB1') expect(value.includes(Buffer.from('customer accounts'))).toBe(false);
    expect(JSON.parse(storage.objects.get('latest.json')!.toString()).setId).toBe(result.setId);

    const out = mkdtempSync(join(tmpdir(), 'mp-restore-'));
    try {
      const fetched = await fetchSet({ storage, key, out: join(out, 'set') });
      expect(readFileSync(fetched.file, 'utf8')).toBe('customer accounts and entitlements');
    } finally { rmSync(out, { recursive: true, force: true }); }
  });

  it('refuses a tampered object or the wrong key', async () => {
    const storage = memoryStorage();
    const result = await backup({ storage, key, retentionDays: 35, dump: dump(), now: new Date() });
    const sealed = Buffer.from(storage.objects.get(result.objectKey)!);
    expect(() => decrypt(sealed, randomBytes(32))).toThrow();
    sealed[20] ^= 1;
    storage.objects.set(result.objectKey, sealed);
    const out = mkdtempSync(join(tmpdir(), 'mp-restore-'));
    try { await expect(fetchSet({ storage, key, out: join(out, 'set') })).rejects.toThrow(); } finally { rmSync(out, { recursive: true, force: true }); }
  });

  it('prunes sets past retention but never the latest', async () => {
    const storage = memoryStorage();
    await backup({ storage, key, retentionDays: 30, dump: dump('old'), now: new Date('2026-09-01T02:15:00Z') });
    const latest = await backup({ storage, key, retentionDays: 30, dump: dump('new'), now: new Date('2026-11-10T02:15:00Z') });
    expect(latest.pruned).toHaveLength(1);
    expect([...storage.objects.keys()].some((k) => k.includes('2026-09-01'))).toBe(false);
    const again = await backup({ storage, key, retentionDays: 1, dump: dump('newest'), now: new Date('2027-01-01T00:00:00Z') });
    expect(again.pruned).toEqual([latest.setId]);
    expect(JSON.parse(storage.objects.get('latest.json')!.toString()).setId).toBe(again.setId);
  });

  it('fails loudly when pg_dump fails or produces an unreadable archive', () => {
    const failingDump = () => ({ status: 1, stderr: 'connection refused' });
    expect(() => dumpDatabase('postgresql://u:p@db:5432/marketplace', failingDump)).toThrow(/pg_dump failed: connection refused/);
    const unreadable = (command: string) => (command === 'pg_dump' ? { status: 0 } : { status: 1, stderr: 'not a valid archive' });
    expect(() => dumpDatabase('postgresql://u:p@db:5432/marketplace', unreadable)).toThrow(/rejected the dump/);
  });

  it('requires a 32-byte key and parses connection settings', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@h:5/d', MARKETPLACE_BACKUP_ENCRYPTION_KEY: randomBytes(16).toString('base64'), MARKETPLACE_BACKUP_S3_BUCKET: 'b', MARKETPLACE_BACKUP_S3_REGION: 'auto', MARKETPLACE_BACKUP_S3_ACCESS_KEY_ID: 'a', MARKETPLACE_BACKUP_S3_SECRET_ACCESS_KEY: 's' };
    expect(() => configuration(env)).toThrow(/32 bytes/);
    expect(configuration({ ...env, MARKETPLACE_BACKUP_ENCRYPTION_KEY: key.toString('base64') }).prefix).toBe('marketplace-backups');
    expect(pgEnvironment('postgresql://user:p%40ss@db.internal:5433/marketplace')).toMatchObject({ PGHOST: 'db.internal', PGPORT: '5433', PGUSER: 'user', PGPASSWORD: 'p@ss', PGDATABASE: 'marketplace' });
    expect(encrypt(Buffer.from('x'), key).subarray(0, 6).toString()).toBe('WTNOB1');
  });
});
