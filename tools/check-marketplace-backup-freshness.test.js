'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, main, signedObjectRequest } = require('./check-marketplace-backup-freshness');

const now = Date.parse('2026-11-12T03:00:00Z');
const record = (overrides = {}) => ({
  format: 'wattanam-marketplace-offsite-set-v1', setId: 'marketplace-2026-11-12T02-15-00-000Z', createdAt: '2026-11-12T02:15:00.000Z',
  objectKey: 'sets/x/marketplace.dump.enc', sha256: 'a'.repeat(64), sizeBytes: 244092, tables: 67, ...overrides,
});

test('a fresh, complete set passes', () => {
  const result = evaluate(record(), { now });
  assert.equal(result.ok, true);
  assert.match(result.summary, /0\.8h old: marketplace-2026-11-12T02-15-00-000Z, 238 KiB, 67 tables/);
});

test('a stale, empty or foreign record fails with a reason', () => {
  assert.match(evaluate(record({ createdAt: '2026-11-10T02:15:00Z' }), { now }).reason, /48\.8h old \(limit 26h/);
  assert.match(evaluate(record({ sizeBytes: 0 }), { now }).reason, /incomplete/);
  assert.match(evaluate(record({ tables: 2 }), { now }).reason, /incomplete/);
  assert.match(evaluate({ format: 'other' }, { now }).reason, /not a marketplace backup set record/);
  assert.match(evaluate(record({ createdAt: 'never' }), { now }).reason, /no valid createdAt/);
});

test('signs a path-style GET without leaking the secret', () => {
  const request = signedObjectRequest({
    endpoint: 'https://account.r2.cloudflarestorage.com', bucket: 'wattanam-marketplace-backups', key: 'marketplace-backups/latest.json',
    region: 'auto', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'super-secret', now: new Date('2026-11-12T03:00:00Z'),
  });
  assert.equal(request.url, 'https://account.r2.cloudflarestorage.com/wattanam-marketplace-backups/marketplace-backups/latest.json');
  assert.equal(request.headers['x-amz-date'], '20261112T030000Z');
  assert.match(request.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261112\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(request).includes('super-secret'), false);
});

test('main reports missing sets, HTTP errors and refuses plain HTTP', async () => {
  const env = {
    MARKETPLACE_BACKUP_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com', MARKETPLACE_BACKUP_S3_BUCKET: 'b',
    MARKETPLACE_BACKUP_READ_ACCESS_KEY_ID: 'id', MARKETPLACE_BACKUP_READ_SECRET_ACCESS_KEY: 'secret',
  };
  await assert.rejects(main(env, async () => ({ status: 404, ok: false })), /no marketplace backup set exists yet/);
  await assert.rejects(main(env, async () => ({ status: 403, ok: false })), /HTTP 403/);
  await assert.rejects(main({ ...env, MARKETPLACE_BACKUP_S3_ENDPOINT: 'http://minio:9000' }), /must use HTTPS/);
  await assert.rejects(main({ ...env, MARKETPLACE_BACKUP_READ_SECRET_ACCESS_KEY: '' }), /READ_SECRET_ACCESS_KEY is required/);
  const fresh = record({ createdAt: new Date().toISOString() });
  assert.match(await main(env, async () => ({ status: 200, ok: true, text: async () => JSON.stringify(fresh) })), /67 tables/);
});
