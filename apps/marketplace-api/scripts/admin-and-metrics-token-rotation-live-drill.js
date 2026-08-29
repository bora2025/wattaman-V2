/**
 * Live drill for the overlap-capable MARKETPLACE_ADMIN_TOKEN and METRICS_TOKEN rotation added to
 * docs/operations/secret-rotation-runbooks.md, mirroring the rigor already applied to the
 * JWT_SECRET rotation. Uses the real, unmodified createApp()/adminGuard()/readMetricsTokens()
 * functions, real HTTP requests against real listening servers (ephemeral ports), and a real
 * disposable PostgreSQL 16 -- not mocked.
 *
 * Run (from apps/marketplace-api, after `npm run build`):
 *   DATABASE_URL=postgresql://user:pass@host:port/db node scripts/admin-and-metrics-token-rotation-live-drill.js
 */
'use strict';

const { generateKeyPairSync } = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { createApp } = require('../dist/app');
const { readConfig } = require('../dist/config');

let passed = 0;
let failed = 0;
function check(description, condition) {
  if (condition) { passed += 1; console.log(`PASS ${description}`); }
  else { failed += 1; console.log(`FAIL ${description}`); }
}

function pem() {
  const { privateKey } = generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  return privateKey;
}

function baseEnv(databaseUrl) {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    PUBLIC_BASE_URL: 'https://marketplace.example',
    METADATA_SIGNING_PRIVATE_KEY: pem(),
    METADATA_SIGNING_KEY_ID: 'repository-drill',
    ENTITLEMENT_SIGNING_PRIVATE_KEY: pem(),
    ENTITLEMENT_SIGNING_KEY_ID: 'entitlement-drill',
    PAYMENT_WEBHOOK_SECRET: 'payment-webhook-secret-at-least-32-chars',
    ARTIFACT_STORAGE_PATH: require('os').tmpdir() + '/token-rotation-drill-artifacts',
    IDENTITY_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'identity-1': require('crypto').randomBytes(32).toString('base64') }),
    IDENTITY_ENCRYPTION_ACTIVE_KEY_ID: 'identity-1',
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function get(port, path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return response.status;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();

  const tokenA = 'admin-token-v1-at-least-32-characters-long';
  const tokenB = 'admin-token-v2-at-least-32-characters-long';

  console.log('== MARKETPLACE_ADMIN_TOKEN overlap rotation ==');
  {
    console.log('-- Step 0: baseline, only tokenA configured --');
    const configA = readConfig({ ...baseEnv(databaseUrl), MARKETPLACE_ADMIN_TOKEN: tokenA });
    const serverA = await listen(createApp(prisma, configA));
    const portA = serverA.address().port;
    check('tokenA works against the baseline deployment', (await get(portA, '/admin/v1/pilot/metrics', tokenA)) === 200);
    check('tokenB is rejected before it has ever been configured', (await get(portA, '/admin/v1/pilot/metrics', tokenB)) === 401);
    await close(serverA);

    console.log('-- Step 1 (runbook): tokenB becomes active, tokenA kept as a trusted secondary --');
    const configOverlap = readConfig({
      ...baseEnv(databaseUrl), MARKETPLACE_ADMIN_TOKEN: tokenB,
      MARKETPLACE_SECONDARY_ADMIN_TOKENS_JSON: JSON.stringify([tokenA]),
    });
    const serverOverlap = await listen(createApp(prisma, configOverlap));
    const portOverlap = serverOverlap.address().port;
    check('the OLD token (tokenA) still works during the overlap window -- the actual point of overlap', (await get(portOverlap, '/admin/v1/pilot/metrics', tokenA)) === 200);
    check('the NEW token (tokenB) works at the same time', (await get(portOverlap, '/admin/v1/pilot/metrics', tokenB)) === 200);
    await close(serverOverlap);

    console.log('-- Step 2 (runbook): overlap window closes, tokenA removed --');
    const configRotated = readConfig({ ...baseEnv(databaseUrl), MARKETPLACE_ADMIN_TOKEN: tokenB });
    const serverRotated = await listen(createApp(prisma, configRotated));
    const portRotated = serverRotated.address().port;
    check('tokenB still works after the old token is dropped', (await get(portRotated, '/admin/v1/pilot/metrics', tokenB)) === 200);
    check('tokenA now fails closed once no longer trusted -- proving rotation actually completes, not just adds forever', (await get(portRotated, '/admin/v1/pilot/metrics', tokenA)) === 401);
    check('a request with no token at all is rejected throughout', (await get(portRotated, '/admin/v1/pilot/metrics', undefined)) === 401);
    await close(serverRotated);
  }

  console.log('\n== METRICS_TOKEN overlap rotation (marketplace-api) ==');
  {
    const metricsA = 'metrics-token-v1-at-least-32-characters';
    const metricsB = 'metrics-token-v2-at-least-32-characters';
    const config = readConfig({ ...baseEnv(databaseUrl), MARKETPLACE_ADMIN_TOKEN: tokenB });
    const server = await listen(createApp(prisma, config));
    const port = server.address().port;
    try {
      process.env.METRICS_TOKEN = metricsA;
      delete process.env.METRICS_SECONDARY_TOKENS_JSON;
      check('metricsA works against the baseline metrics token', (await get(port, '/metrics', metricsA)) === 200);

      process.env.METRICS_TOKEN = metricsB;
      process.env.METRICS_SECONDARY_TOKENS_JSON = JSON.stringify([metricsA]);
      check('the OLD metrics token still works during the overlap window', (await get(port, '/metrics', metricsA)) === 200);
      check('the NEW metrics token works at the same time', (await get(port, '/metrics', metricsB)) === 200);

      delete process.env.METRICS_SECONDARY_TOKENS_JSON;
      check('the new metrics token still works after the old one is dropped', (await get(port, '/metrics', metricsB)) === 200);
      check('the old metrics token now fails closed', (await get(port, '/metrics', metricsA)) === 401);
    } finally {
      delete process.env.METRICS_TOKEN;
      delete process.env.METRICS_SECONDARY_TOKENS_JSON;
      await close(server);
    }
  }

  await prisma.$disconnect();
  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
