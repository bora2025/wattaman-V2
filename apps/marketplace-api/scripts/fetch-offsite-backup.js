#!/usr/bin/env node
'use strict';

// Restore side of offsite-backup.js: downloads the newest (or a named) marketplace set, decrypts it,
// verifies its SHA-256 and writes marketplace.dump. Then restore with, for example:
//   pg_restore --clean --if-exists --no-owner --no-acl --single-transaction --dbname <target> marketplace.dump
// Usage: node scripts/fetch-offsite-backup.js --out <empty dir> [--set <setId>]   (same env as the backup)

const fs = require('node:fs');
const path = require('node:path');
const { configuration, decrypt, s3Storage, sha256 } = require('./offsite-backup');

async function fetchSet({ storage, key, setId, out }) {
  const raw = await storage.get(setId ? `sets/${setId}/set.json` : 'latest.json');
  if (!raw) throw new Error(`No marketplace backup set found${setId ? ` for ${setId}` : ''}`);
  const record = JSON.parse(raw.toString('utf8'));
  if (record.format !== 'wattanam-marketplace-offsite-set-v1') throw new Error('Not a marketplace backup set record');
  const sealed = await storage.get(record.objectKey);
  if (!sealed) throw new Error(`Backup object missing: ${record.objectKey}`);
  const plaintext = decrypt(sealed, key);
  if (sha256(plaintext) !== record.sha256) throw new Error('Checksum mismatch: the backup is corrupt');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  if (fs.readdirSync(out).length) throw new Error(`--out must be an empty directory: ${out}`);
  const file = path.join(out, 'marketplace.dump');
  fs.writeFileSync(file, plaintext, { flag: 'wx', mode: 0o600 });
  return { ...record, file };
}

async function main(argv = process.argv.slice(2)) {
  const at = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  if (!at('--out')) throw new Error('Usage: node scripts/fetch-offsite-backup.js --out <empty dir> [--set <setId>]');
  const config = configuration({ ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://unused@localhost/unused' });
  const result = await fetchSet({ storage: s3Storage(config), key: config.key, setId: at('--set'), out: path.resolve(at('--out')) });
  process.stdout.write(`${JSON.stringify({ status: 'fetched', setId: result.setId, createdAt: result.createdAt, file: result.file })}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });

module.exports = { fetchSet };
