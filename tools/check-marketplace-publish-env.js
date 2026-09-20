'use strict';

const fs = require('node:fs');
const { loadMarketplaceEnv } = require('./marketplace-env-loader');

const loaded = loadMarketplaceEnv();
if (loaded.loadedFrom) {
  console.log(`ENV_SOURCE=${loaded.loadedFrom}`);
}

const required = [
  'MARKETPLACE_URL',
  'MARKETPLACE_ADMIN_TOKEN',
  'PLUGIN_SIGNING_PRIVATE_KEY',
  'PLUGIN_SIGNING_KEY_ID',
];

let missing = 0;
for (const name of required) {
  const value = process.env[name];
  if (!value) {
    missing += 1;
    console.log(`${name}=MISSING`);
    continue;
  }

  if (name === 'PLUGIN_SIGNING_PRIVATE_KEY') {
    console.log(`${name}=SET pathExists=${fs.existsSync(value)}`);
  } else {
    console.log(`${name}=SET`);
  }
}

if (missing) {
  process.exitCode = 1;
}
