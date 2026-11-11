#!/usr/bin/env node
'use strict';

// Nightly encrypted off-site backup of the MARKETPLACE database (accounts, orders, entitlements,
// publishers, catalog). Runs as the `marketplace-backup` Railway cron service, never inside the API
// (the API runs 2 replicas, which would back up twice).
//
//   pg_dump -Fc  ->  pg_restore --list (proves the archive is readable)  ->  AES-256-GCM  ->  S3/R2
//   sets/<id>/marketplace.dump.enc + sets/<id>/set.json, then latest.json (written LAST, so it
//   only ever names a complete set). Sets past retention are pruned; the latest never is.
//
// Same object format as the school's off-site backups: "WTNOB1" | 12-byte IV | ciphertext | 16-byte tag.
// Env: DATABASE_URL, MARKETPLACE_BACKUP_ENCRYPTION_KEY (32 bytes base64), MARKETPLACE_BACKUP_S3_BUCKET,
//      _REGION, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY, optional _ENDPOINT, _PREFIX (marketplace-backups),
//      _FORCE_PATH_STYLE, MARKETPLACE_BACKUP_RETENTION_DAYS (35).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');

const MAGIC = Buffer.from('WTNOB1', 'ascii');

function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

function decrypt(sealed, key) {
  if (sealed.length < 34 || !sealed.subarray(0, 6).equals(MAGIC)) throw new Error('Not a Wattanam off-site backup object');
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(6, 18));
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([decipher.update(sealed.subarray(18, sealed.length - 16)), decipher.final()]);
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function required(env, name) {
  const value = env[name] && env[name].trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function configuration(env = process.env) {
  const key = Buffer.from(required(env, 'MARKETPLACE_BACKUP_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('MARKETPLACE_BACKUP_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  const retentionDays = Number((env.MARKETPLACE_BACKUP_RETENTION_DAYS || '35').trim());
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('MARKETPLACE_BACKUP_RETENTION_DAYS must be 1-3650');
  const endpoint = env.MARKETPLACE_BACKUP_S3_ENDPOINT && env.MARKETPLACE_BACKUP_S3_ENDPOINT.trim();
  if (endpoint && env.NODE_ENV === 'production' && new URL(endpoint).protocol !== 'https:') throw new Error('MARKETPLACE_BACKUP_S3_ENDPOINT must use HTTPS in production');
  return {
    databaseUrl: required(env, 'DATABASE_URL'), key, retentionDays,
    bucket: required(env, 'MARKETPLACE_BACKUP_S3_BUCKET'), region: required(env, 'MARKETPLACE_BACKUP_S3_REGION'), endpoint: endpoint || undefined,
    accessKeyId: required(env, 'MARKETPLACE_BACKUP_S3_ACCESS_KEY_ID'), secretAccessKey: required(env, 'MARKETPLACE_BACKUP_S3_SECRET_ACCESS_KEY'),
    prefix: (env.MARKETPLACE_BACKUP_S3_PREFIX || 'marketplace-backups').trim().replace(/\/$/, ''),
    forcePathStyle: (env.MARKETPLACE_BACKUP_S3_FORCE_PATH_STYLE || '').trim() === 'true',
  };
}

function pgEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    ...(url.searchParams.get('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}),
  };
}

/** Storage adapter: { put(key, buffer), get(key) -> buffer|null, list(prefix) -> keys[], remove(key) }. */
function s3Storage(config) {
  const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  const full = (key) => `${config.prefix}/${key}`;
  return {
    put: (key, body) => client.send(new PutObjectCommand({ Bucket: config.bucket, Key: full(key), Body: body, Metadata: { sha256: sha256(body) } })),
    async get(key) {
      try { const r = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: full(key) })); return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : Buffer.alloc(0); } catch (error) {
        if (error && (error.name === 'NoSuchKey' || (error.$metadata && error.$metadata.httpStatusCode === 404))) return null; throw error;
      }
    },
    async list(prefix) {
      const keys = []; let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: full(prefix), ContinuationToken: token }));
        for (const item of page.Contents || []) if (item.Key) keys.push(item.Key.slice(config.prefix.length + 1));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    remove: (key) => client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: full(key) })),
  };
}

function dumpDatabase(databaseUrl, run = spawnSync) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-backup-'));
  const file = path.join(directory, 'marketplace.dump');
  try {
    const environment = pgEnvironment(databaseUrl);
    const dump = run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', file], { env: environment, encoding: 'utf8' });
    if (dump.status !== 0) throw new Error(`pg_dump failed: ${(dump.stderr || '').trim().slice(-500)}`);
    const list = run('pg_restore', ['--list', file], { encoding: 'utf8' });
    if (list.status !== 0) throw new Error(`pg_restore --list rejected the dump: ${(list.stderr || '').trim().slice(-500)}`);
    const tables = (list.stdout || '').split('\n').filter((line) => / TABLE DATA /.test(line)).length;
    return { bytes: fs.readFileSync(file), tables };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

async function backup({ storage, key, retentionDays, dump, now = new Date() }) {
  const setId = `marketplace-${now.toISOString().replace(/[:.]/g, '-')}`;
  const { bytes, tables } = dump;
  const objectKey = `sets/${setId}/marketplace.dump.enc`;
  await storage.put(objectKey, encrypt(bytes, key));
  const record = { format: 'wattanam-marketplace-offsite-set-v1', setId, createdAt: now.toISOString(), objectKey, sha256: sha256(bytes), sizeBytes: bytes.length, tables };
  const body = Buffer.from(JSON.stringify(record, null, 2));
  await storage.put(`sets/${setId}/set.json`, body);
  await storage.put('latest.json', body);
  const pruned = await prune({ storage, retentionDays, latestId: setId, now });
  return { ...record, pruned };
}

async function prune({ storage, retentionDays, latestId, now }) {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  const keys = await storage.list('sets/');
  const removed = [];
  for (const setId of [...new Set(keys.map((k) => k.split('/')[1]).filter(Boolean))]) {
    if (setId === latestId) continue;
    const raw = await storage.get(`sets/${setId}/set.json`);
    if (raw && !(Date.parse(JSON.parse(raw.toString('utf8')).createdAt) < cutoff)) continue;
    for (const key of keys.filter((k) => k.startsWith(`sets/${setId}/`))) await storage.remove(key);
    removed.push(setId);
  }
  return removed;
}

async function main() {
  const config = configuration();
  const result = await backup({ storage: s3Storage(config), key: config.key, retentionDays: config.retentionDays, dump: dumpDatabase(config.databaseUrl) });
  process.stdout.write(`${JSON.stringify({ status: 'uploaded', setId: result.setId, sizeBytes: result.sizeBytes, tables: result.tables, pruned: result.pruned.length })}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`Marketplace off-site backup failed: ${error.message}\n`); process.exit(1); });

module.exports = { backup, configuration, decrypt, dumpDatabase, encrypt, pgEnvironment, prune, s3Storage, sha256 };
