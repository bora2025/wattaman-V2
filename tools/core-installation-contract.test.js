const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'backend/src/installation/installation.service.ts'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'backend/src/installation/installation.module.ts'), 'utf8');
const setupPage = fs.readFileSync(path.join(root, 'frontend/app/setup/page.tsx'), 'utf8');
const coreContract = JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/core-schema-contract.json'), 'utf8'));

function prismaDelegates(source) {
  return [...source.matchAll(/(?:this\.)?prisma\.([a-z][A-Za-z0-9]*)\./g)].map((match) => match[1]);
}

test('LC2-016: installation persists only accepted core-owned records', () => {
  const modelNames = new Set(coreContract.freshCore.models);
  const delegates = [...new Set(prismaDelegates(service))];
  const models = delegates.map((delegate) => delegate[0].toUpperCase() + delegate.slice(1));
  assert.deepEqual(delegates.sort(), ['installation', 'user'].sort());
  assert.ok(models.every((model) => modelNames.has(model)), `non-core install model: ${models.filter((model) => !modelNames.has(model))}`);
  assert.match(service, /tx\.siteSetting\.upsert/);
  assert.ok(modelNames.has('SiteSetting'));
});

test('LC2-016: standalone installer cannot bootstrap the optional plugin runtime', () => {
  assert.doesNotMatch(moduleSource, /from ['"]\.\.\/plugins\/plugins\.module['"]/);
  assert.doesNotMatch(moduleSource, /PluginPackageVerifier|PluginsModule/);
});

test('LC2-016: interactive setup creates only school identity and its first owner', () => {
  assert.match(setupPage, /installWattanam/);
  assert.doesNotMatch(setupPage, /initialPlugins|Choose File|plugin package/i);
  assert.match(setupPage, /SUPER_ADMIN/);
});
