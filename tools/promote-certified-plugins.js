'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadMarketplaceEnv } = require('./marketplace-env-loader');

function required(name) {
  const value = process.env[name]?.replace(/\uFEFF/g, '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  loadMarketplaceEnv();
  const baseUrl = new URL(required('MARKETPLACE_URL'));
  const token = required('MARKETPLACE_ADMIN_TOKEN');
  const sourceDirs = (process.env.PLUGIN_SOURCES || '')
    .split(',').map((value) => value.trim()).filter(Boolean)
    .map((value) => path.resolve(process.cwd(), value));
  if (!sourceDirs.length) throw new Error('PLUGIN_SOURCES must list the certified plugin source directories to promote');
  for (const source of sourceDirs) {
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
    const response = await fetch(new URL('/admin/v1/plugin-releases/promote', baseUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pluginId: manifest.id, version: manifest.version }),
    });
    if (!response.ok) throw new Error(`Promotion failed for ${manifest.id}@${manifest.version} (${response.status}): ${await response.text()}`);
    process.stdout.write(`Promoted certified artifact: ${manifest.id}@${manifest.version}\n`);
  }
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
