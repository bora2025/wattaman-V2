'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadMarketplaceEnv } = require('./marketplace-env-loader');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  // Environment files written by Windows tools may carry a UTF-8 BOM into the first value. A BOM
  // is invisible to operators but invalid in an HTTP ByteString header such as Authorization.
  return value.replace(/\uFEFF/g, '').trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return value;
}

function parseBool(value, fallback) {
  if (!value) return fallback;
  return String(value).toLowerCase() === 'true';
}

function usage() {
  process.stdout.write(
    [
      'Pack and publish plugins in one command.',
      '',
      'Required env:',
      '  MARKETPLACE_URL',
      '  MARKETPLACE_ADMIN_TOKEN',
      '  PLUGIN_SIGNING_PRIVATE_KEY',
      '  PLUGIN_SIGNING_KEY_ID',
      '',
      'Optional env:',
      '  PLUGIN_SOURCES        Comma-separated plugin source directories.',
      '                        Default: all direct children under ./plugins containing plugin.json',
      '  PLUGIN_PACKAGES_DIR   Output directory for .wtp packages (default: ./tmp/plugin-packages)',
      '  CHANNEL               STABLE or BETA (default: STABLE)',
      '  PAID                  true/false publish flag for all packages (default: false)',
      '  CHANGELOG             Publish changelog (default: Automated pack+publish)',
      '  PUBLISH_ONLY          true/false. Skip packing and publish existing .wtp files (default: false)',
      '  MARKETPLACE_ENV_FILE  Optional env file path (default lookup: ./.env.marketplace.local, ./.env.local, ./.env)',
      '',
      'Example (PowerShell):',
      '  $env:MARKETPLACE_URL = "https://marketplace.example"',
      '  $env:MARKETPLACE_ADMIN_TOKEN = "..."',
      '  $env:PLUGIN_SIGNING_PRIVATE_KEY = "C:/secure/plugin-signing-private.pem"',
      '  $env:PLUGIN_SIGNING_KEY_ID = "official-plugin-2026"',
      '  node tools/pack-and-publish-plugins.js',
      '',
    ].join('\n'),
  );
}

function listPluginSources(rootDir, requestedSources) {
  if (requestedSources) {
    return requestedSources
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(rootDir, entry));
  }

  const pluginsDir = path.resolve(rootDir, 'plugins');
  if (!fs.existsSync(pluginsDir)) return [];

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsDir, entry.name))
    .filter((folder) => fs.existsSync(path.join(folder, 'plugin.json')))
    .sort();
}

function readPluginManifest(sourceDir) {
  const manifestPath = path.join(sourceDir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing plugin.json in ${sourceDir}`);
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (!manifest.id || !manifest.version) {
    throw new Error(`Manifest must include id and version: ${manifestPath}`);
  }
  return manifest;
}

function runPack({ rootDir, sourceDir, privateKeyPath, keyId, outputPath }) {
  const cliPath = path.resolve(rootDir, 'packages/plugin-cli/bin/cli.js');
  const args = [
    cliPath,
    'pack',
    '--source',
    sourceDir,
    '--private-key',
    privateKeyPath,
    '--key-id',
    keyId,
    '--out',
    outputPath,
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const detail = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim();
    throw new Error(`Pack failed for ${sourceDir}${detail ? `\n${detail}` : ''}`);
  }
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
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (response.ok) return { ok: true, payload };

  const errorMessage = payload && typeof payload === 'object' && payload.error
    ? payload.error
    : `Publish failed (${response.status})`;
  return { ok: false, status: response.status, error: String(errorMessage), payload };
}

function collectPackages(packagesDir) {
  if (!fs.existsSync(packagesDir)) return [];
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.wtp'))
    .map((entry) => path.join(packagesDir, entry.name))
    .sort();
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  loadMarketplaceEnv();

  const rootDir = process.cwd();
  const baseUrl = new URL(required('MARKETPLACE_URL'));
  const token = required('MARKETPLACE_ADMIN_TOKEN');
  const privateKeyPath = optional('PLUGIN_SIGNING_PRIVATE_KEY', '');
  const keyId = optional('PLUGIN_SIGNING_KEY_ID', '');
  const sourceList = optional('PLUGIN_SOURCES', '');
  const packagesDir = path.resolve(rootDir, optional('PLUGIN_PACKAGES_DIR', './tmp/plugin-packages'));
  const channel = optional('CHANNEL', 'STABLE').toUpperCase();
  const paid = parseBool(optional('PAID', 'false'), false);
  const changelog = optional('CHANGELOG', 'Automated pack+publish');
  const publishOnly = parseBool(optional('PUBLISH_ONLY', 'false'), false);

  if (!['STABLE', 'BETA'].includes(channel)) {
    throw new Error('CHANNEL must be STABLE or BETA');
  }

  if (!publishOnly) {
    if (!privateKeyPath) throw new Error('PLUGIN_SIGNING_PRIVATE_KEY is required when PUBLISH_ONLY is false');
    if (!keyId) throw new Error('PLUGIN_SIGNING_KEY_ID is required when PUBLISH_ONLY is false');

    fs.mkdirSync(packagesDir, { recursive: true });

    const pluginSources = listPluginSources(rootDir, sourceList);
    if (!pluginSources.length) {
      throw new Error('No plugin sources found. Set PLUGIN_SOURCES or add plugin folders under ./plugins');
    }

    process.stdout.write(`Packing ${pluginSources.length} plugin(s) into ${packagesDir}\n`);

    for (const sourceDir of pluginSources) {
      const manifest = readPluginManifest(sourceDir);
      const outName = `${manifest.id}-${manifest.version}.wtp`;
      const outPath = path.join(packagesDir, outName);
      process.stdout.write(`- ${path.basename(sourceDir)} -> ${outName} ... `);
      runPack({ rootDir, sourceDir, privateKeyPath, keyId, outputPath: outPath });
      process.stdout.write('OK\n');
    }

    process.stdout.write('\n');
  }

  const packageFiles = collectPackages(packagesDir);
  if (!packageFiles.length) {
    throw new Error(`No .wtp files found in ${packagesDir}`);
  }

  process.stdout.write(`Publishing ${packageFiles.length} package(s) from ${packagesDir}\n`);

  let success = 0;
  const failures = [];

  for (const filePath of packageFiles) {
    process.stdout.write(`- ${path.basename(filePath)} ... `);
    const result = await publishOne(baseUrl, token, filePath, { channel, paid, changelog });
    if (result.ok) {
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
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
