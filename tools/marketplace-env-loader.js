'use strict';

const fs = require('node:fs');
const path = require('node:path');

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(content) {
  const entries = [];
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    const value = stripQuotes(normalized.slice(eqIndex + 1));
    if (!key) continue;
    entries.push({ key, value });
  }

  return entries;
}

function loadMarketplaceEnv() {
  const rootDir = process.cwd();
  const preferred = process.env.MARKETPLACE_ENV_FILE
    ? [path.resolve(rootDir, process.env.MARKETPLACE_ENV_FILE)]
    : [
      path.resolve(rootDir, '.env.marketplace.local'),
      path.resolve(rootDir, '.env.local'),
      path.resolve(rootDir, '.env'),
    ];

  const envPath = preferred.find((candidate) => fs.existsSync(candidate));
  if (!envPath) {
    return { loadedFrom: null, appliedKeys: [] };
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const pairs = parseEnvFile(content);
  const appliedKeys = [];

  for (const { key, value } of pairs) {
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
      appliedKeys.push(key);
    }
  }

  return { loadedFrom: envPath, appliedKeys };
}

module.exports = {
  loadMarketplaceEnv,
};
