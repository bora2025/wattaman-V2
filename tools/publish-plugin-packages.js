'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadMarketplaceEnv } = require('./marketplace-env-loader');
const { certify } = require('./certify-plugin-release');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/\uFEFF/g, '').trim();
}

function readBool(name, defaultValue) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function usage() {
  process.stdout.write(
    [
      'Publish prebuilt .wtp plugin packages to the marketplace catalog.',
      '',
      'Required env:',
      '  MARKETPLACE_URL',
      '  MARKETPLACE_ADMIN_TOKEN',
      '',
      'Optional env:',
      '  PLUGIN_PACKAGES_DIR   Directory containing .wtp files (default: ./tmp/plugin-packages)',
      '  CHANNEL               Must be BETA (default: BETA). Stable releases are promoted without rebuilding.',
      '  PAID                  true/false (default: false)',
      '  CHANGELOG             Changelog text (default: Automated publish)',
      '  MARKETPLACE_ENV_FILE  Optional env file path (default lookup: ./.env.marketplace.local, ./.env.local, ./.env)',
      '',
      'Example:',
      '  MARKETPLACE_URL=https://marketplace.example \\',
      '  MARKETPLACE_ADMIN_TOKEN=... \\',
      '  PLUGIN_PACKAGES_DIR=./tmp/plugin-packages \\',
      '  node tools/publish-plugin-packages.js',
      '',
    ].join('\n'),
  );
}

async function publishOne(baseUrl, token, filePath, fields) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.set('channel', fields.channel);
  form.set('paid', fields.paid ? 'true' : 'false');
  form.set('changelog', fields.changelog);
  form.set('package', new Blob([buffer], { type: 'application/vnd.wattanam.plugin+zip' }), path.basename(filePath));

  const response = await fetch(new URL('/admin/v1/plugin-releases', baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });

  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = text; }

  if (response.ok) {
    return { ok: true, payload };
  }

  const errorMessage = payload && typeof payload === 'object' && payload.error
    ? payload.error
    : `Publish failed (${response.status})`;
  return { ok: false, status: response.status, error: String(errorMessage), payload };
}

async function certifyPublished(baseUrl, token, published, certification) {
  const response = await fetch(new URL('/admin/v1/plugin-releases/certify', baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ pluginId: published.pluginId, version: published.version, artifactSha256: published.sha256, marketplaceCommit: certification.marketplaceCommit, customerSchoolCommit: certification.customerSchoolCommit, checks: certification.checks }),
  });
  if (!response.ok) throw new Error(`Published beta certification failed (${response.status}): ${await response.text()}`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  loadMarketplaceEnv();
  const certification = certify();

  const baseUrl = new URL(required('MARKETPLACE_URL'));
  const token = required('MARKETPLACE_ADMIN_TOKEN');
  const packagesDir = path.resolve(process.cwd(), process.env.PLUGIN_PACKAGES_DIR || './tmp/plugin-packages');
  const channel = (process.env.CHANNEL || 'BETA').toUpperCase();
  const paid = readBool('PAID', false);
  const changelog = process.env.CHANGELOG || 'Automated publish';

  if (channel !== 'BETA') {
    throw new Error('Direct stable publication is prohibited. Publish BETA, certify that exact artifact, then promote it to STABLE.');
  }

  if (!fs.existsSync(packagesDir)) {
    throw new Error(`PLUGIN_PACKAGES_DIR does not exist: ${packagesDir}`);
  }

  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.wtp'))
    .map((entry) => path.join(packagesDir, entry.name))
    .sort();

  if (!files.length) {
    throw new Error(`No .wtp files found in ${packagesDir}`);
  }

  process.stdout.write(`Publishing ${files.length} package(s) from ${packagesDir}\n`);

  let success = 0;
  const failures = [];
  for (const filePath of files) {
    process.stdout.write(`- ${path.basename(filePath)} ... `);
    const result = await publishOne(baseUrl, token, filePath, { channel, paid, changelog });
    if (result.ok) {
      await certifyPublished(baseUrl, token, result.payload, certification);
      success += 1;
      const id = result.payload && typeof result.payload === 'object' ? result.payload.pluginId : '';
      const version = result.payload && typeof result.payload === 'object' ? result.payload.version : '';
      process.stdout.write(`OK${id ? ` (${id}@${version})` : ''}\n`);
    } else {
      failures.push({ filePath, result });
      process.stdout.write(`FAILED (${result.status}): ${result.error}\n`);
    }
  }

  process.stdout.write(`\nDone: ${success} succeeded, ${failures.length} failed.\n`);

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
