#!/usr/bin/env node
'use strict';

// Scheduled monitor: reads `latest.json` written LAST by the marketplace-backup cron service
// (apps/marketplace-api/scripts/offsite-backup.js) straight from the R2/S3 bucket with a READ-ONLY
// key, and fails when the newest complete encrypted set is older than the allowed age
// (default 26h = daily 02:15 UTC run + slack) or looks empty. The record holds only ids, times,
// sizes and a checksum, never data. No dependencies: one SigV4-signed GET.
//
// Env: MARKETPLACE_BACKUP_S3_ENDPOINT (https), MARKETPLACE_BACKUP_S3_BUCKET,
//      MARKETPLACE_BACKUP_READ_ACCESS_KEY_ID, MARKETPLACE_BACKUP_READ_SECRET_ACCESS_KEY,
//      optional MARKETPLACE_BACKUP_S3_REGION (auto), MARKETPLACE_BACKUP_S3_PREFIX
//      (marketplace-backups), MAX_BACKUP_AGE_HOURS (26), MIN_BACKUP_TABLES (10).

const { createHash, createHmac } = require('node:crypto');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = (segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Path-style SigV4 GET request for one object (works for R2, MinIO and S3). */
function signedObjectRequest({ endpoint, bucket, key, region, accessKeyId, secretAccessKey, now = new Date() }) {
  const url = new URL(endpoint);
  const path = `${url.pathname.replace(/\/$/, '')}/${encode(bucket)}/${key.split('/').map(encode).join('/')}`;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payload = hash('');
  const headers = { host: url.host, 'x-amz-content-sha256': payload, 'x-amz-date': amzDate };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonical = ['GET', path, '', ...Object.keys(headers).sort().map((name) => `${name}:${headers[name]}`), '', signedHeaders, payload].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  return {
    url: `${url.origin}${path}`,
    headers: { 'x-amz-content-sha256': payload, 'x-amz-date': amzDate, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
  };
}

function evaluate(record, { now = Date.now(), maxAgeHours = 26, minTables = 10 } = {}) {
  if (!record || record.format !== 'wattanam-marketplace-offsite-set-v1') return { ok: false, reason: 'latest.json is not a marketplace backup set record' };
  const created = Date.parse(record.createdAt);
  if (!Number.isFinite(created)) return { ok: false, reason: 'latest.json has no valid createdAt' };
  const hours = (now - created) / 3_600_000;
  if (hours > maxAgeHours) return { ok: false, reason: `newest marketplace backup is ${hours.toFixed(1)}h old (limit ${maxAgeHours}h, set ${record.setId})` };
  if (!(record.sizeBytes > 0) || !(record.tables >= minTables) || !/^[a-f0-9]{64}$/.test(String(record.sha256))) {
    return { ok: false, reason: `newest marketplace backup looks incomplete (${record.sizeBytes} bytes, ${record.tables} tables)` };
  }
  return { ok: true, summary: `newest marketplace backup is ${hours.toFixed(1)}h old: ${record.setId}, ${(record.sizeBytes / 1024).toFixed(0)} KiB, ${record.tables} tables` };
}

function required(env, name) {
  const value = (env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(env = process.env, fetchImpl = fetch) {
  const endpoint = required(env, 'MARKETPLACE_BACKUP_S3_ENDPOINT');
  if (new URL(endpoint).protocol !== 'https:') throw new Error('MARKETPLACE_BACKUP_S3_ENDPOINT must use HTTPS');
  const prefix = (env.MARKETPLACE_BACKUP_S3_PREFIX || 'marketplace-backups').trim().replace(/\/$/, '');
  const request = signedObjectRequest({
    endpoint, bucket: required(env, 'MARKETPLACE_BACKUP_S3_BUCKET'), key: `${prefix}/latest.json`,
    region: (env.MARKETPLACE_BACKUP_S3_REGION || 'auto').trim(),
    accessKeyId: required(env, 'MARKETPLACE_BACKUP_READ_ACCESS_KEY_ID'), secretAccessKey: required(env, 'MARKETPLACE_BACKUP_READ_SECRET_ACCESS_KEY'),
  });
  const response = await fetchImpl(request.url, { headers: request.headers });
  if (response.status === 404) throw new Error('no marketplace backup set exists yet (latest.json missing)');
  if (!response.ok) throw new Error(`reading latest.json failed: HTTP ${response.status}`);
  const result = evaluate(JSON.parse(await response.text()), {
    maxAgeHours: Number(env.MAX_BACKUP_AGE_HOURS || 26), minTables: Number(env.MIN_BACKUP_TABLES || 10),
  });
  if (!result.ok) throw new Error(result.reason);
  return result.summary;
}

if (require.main === module) {
  main().then((summary) => console.log(`OK: ${summary}`)).catch((error) => { console.error(`FAIL: ${error.message}`); process.exit(1); });
}

module.exports = { evaluate, main, signedObjectRequest };
