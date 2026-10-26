'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const compose = fs.readFileSync(path.join(root, 'docker-compose.marketplace.yml'), 'utf8');
const apiDockerfile = fs.readFileSync(path.join(root, 'apps/marketplace-api/Dockerfile'), 'utf8');
const adminDockerfile = fs.readFileSync(path.join(root, 'apps/platform-admin/Dockerfile'), 'utf8');

test('provider-neutral stack keeps the database private and separates control-plane services', () => {
  assert.match(compose, /marketplace-api:/);
  assert.match(compose, /platform-admin:/);
  assert.match(compose, /postgres:/);
  assert.doesNotMatch(compose, /5432:5432/, 'PostgreSQL must not be exposed to the host network');
  assert.match(compose, /METADATA_SIGNING_PRIVATE_KEY_FILE: \/run\/secrets\/repository-signing-private\.pem/);
  assert.match(compose, /ENTITLEMENT_SIGNING_PRIVATE_KEY_FILE: \/run\/secrets\/entitlement-signing-private\.pem/);
  assert.match(compose, /MARKETPLACE_API_URL: http:\/\/marketplace-api:3010/);
});

test('production containers use the supported Node 24 runtime line', () => {
  for (const source of [apiDockerfile, adminDockerfile]) {
    assert.match(source, /^FROM node:24-/m);
    assert.doesNotMatch(source, /^FROM node:(?:20|22)-/m);
  }
});
