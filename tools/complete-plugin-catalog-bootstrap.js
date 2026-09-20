'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { loadMarketplaceEnv } = require('./marketplace-env-loader');

function usage() {
  process.stdout.write(
    [
      'Complete plugin catalog bootstrap in one command.',
      '',
      'This command does all steps:',
      '1) validates required environment variables',
      '2) packs and publishes plugins',
      '3) verifies MARKETPLACE_URL/v1/catalog is non-empty',
      '',
      'Required env:',
      '  MARKETPLACE_URL',
      '  MARKETPLACE_ADMIN_TOKEN',
      '  PLUGIN_SIGNING_PRIVATE_KEY',
      '  PLUGIN_SIGNING_KEY_ID',
      '  (or provide MARKETPLACE_ENV_FILE pointing to an env file)',
      '',
      'Usage:',
      '  node tools/complete-plugin-catalog-bootstrap.js',
      '',
      'Tip:',
      '  Set PLUGIN_SOURCES to limit publish scope, for example:',
      '  PLUGIN_SOURCES=plugins/announcements,plugins/wattanam.document-designer',
      '',
    ].join('\n'),
  );
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required`);
  return value;
}

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    fail(`Command failed: node ${scriptPath}`);
  }
}

async function verifyCatalogNotEmpty(baseUrl) {
  const url = new URL('/v1/catalog', baseUrl);
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    fail(`Catalog request failed (${response.status}): ${text.slice(0, 500)}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    fail('Catalog returned non-JSON response');
  }

  let count = 0;
  if (Array.isArray(payload)) {
    count = payload.length;
  } else if (payload && typeof payload === 'object' && Array.isArray(payload.items)) {
    count = payload.items.length;
  }

  if (count === 0) {
    fail('Catalog verification failed: /v1/catalog is still empty');
  }

  process.stdout.write(`Catalog verification passed: ${count} item(s) found.\n`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  loadMarketplaceEnv();

  process.stdout.write('Checking environment prerequisites...\n');
  const baseUrl = requireEnv('MARKETPLACE_URL');
  requireEnv('MARKETPLACE_ADMIN_TOKEN');
  const privateKeyPath = requireEnv('PLUGIN_SIGNING_PRIVATE_KEY');
  requireEnv('PLUGIN_SIGNING_KEY_ID');

  if (!fs.existsSync(privateKeyPath)) {
    fail(`PLUGIN_SIGNING_PRIVATE_KEY file does not exist: ${privateKeyPath}`);
  }

  process.stdout.write('Environment check passed.\n\n');

  process.stdout.write('Running pack and publish...\n');
  runNodeScript('tools/pack-and-publish-plugins.js');

  process.stdout.write('\nVerifying catalog endpoint...\n');
  await verifyCatalogNotEmpty(baseUrl);

  process.stdout.write('\nComplete: plugins should now appear in Platform Admin and linked customer schools.\n');
}

main().catch((error) => fail(error.message));
