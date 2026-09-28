const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('initial installation and updates require server-bound disclosure consent', () => {
  const marketplace = read('backend/src/marketplace/marketplace-commerce.service.ts');
  const updates = read('backend/src/updates/updates.service.ts');
  const page = read('frontend/app/admin/plugins/page.tsx');

  assert.match(marketplace, /consentDigest !== pluginInstallConsentDigest\(release\.manifest\)/);
  assert.match(updates, /consentDigest !== pluginInstallConsentDigest\(release\.manifest\)/);
  assert.match(page, /Review & install/);
  assert.match(page, /Review & update/);
  assert.match(page, /consentDigest: release\.consentDigest/);
});

test('lifecycle UI exposes dependency, migration, retention and real rollback state', () => {
  const page = read('frontend/app/admin/plugins/page.tsx');
  const plugins = read('backend/src/plugins/plugins.service.ts');

  assert.match(page, /Installation access and data policy/);
  assert.match(page, /missingDependencies\.length > 0/);
  assert.match(page, /destructive change declared/);
  assert.match(page, /preserved when deactivated or removed/);
  assert.match(page, /plugin\.rollbackAvailable/);
  assert.match(page, /\/api\/plugins\/\$\{encodeURIComponent\(plugin\.id\)\}\/rollback/);
  assert.match(plugins, /rollbackAvailable: this\.rollout \? !!await this\.rollout\.previous\(plugin\.id\) : false/);
});
