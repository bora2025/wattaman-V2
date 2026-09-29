const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('starter bundles are metadata collections, never package artifacts', () => {
  const schema = read('apps/marketplace-api/prisma/schema.prisma');
  const service = read('apps/marketplace-api/src/starter-bundle.service.ts');
  assert.match(schema, /model StarterBundle\s*{/);
  assert.match(schema, /model StarterBundleItem\s*{/);
  const bundleModel = schema.match(/model StarterBundle\s*{[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(bundleModel, /artifact|package|price|entitlement/i);
  assert.match(service, /no approved Stable artifact matching/);
  assert.match(service, /versionRange/);
});

test('bundle acquisition reuses ordinary multi-line orders and per-plugin signed installs', () => {
  const controller = read('backend/src/marketplace/marketplace-commerce.controller.ts');
  const service = read('backend/src/marketplace/marketplace-commerce.service.ts');
  assert.match(controller, /priceIds\?: string\[\]/);
  assert.match(service, /priceIds, idempotencyKey/);
  assert.match(service, /await this\.install\(planned\.pluginId, version, activate/);
  assert.match(service, /Fix the error and retry safely/);
  assert.doesNotMatch(service, /bundlePackage|bundleArtifact|installBundleArchive/);
});

test('school Plugin Manager exposes governed starter bundles with explicit review', () => {
  const page = read('frontend/app/admin/plugins/page.tsx');
  assert.match(page, /Recommended starter bundles/);
  assert.match(page, /Each plugin remains independently signed, consented, licensed, and removable/);
  assert.match(page, /starter-bundles\/\$\{encodeURIComponent\(bundle\.id\)\}\/install/);
});

test('Platform Admin governs starter bundles through permissioned and audited routes', () => {
  const app = read('apps/marketplace-api/src/app.ts');
  const proxy = read('apps/platform-admin/app/api/platform/[...path]/route.ts');
  const page = read('apps/platform-admin/app/(operator)/starter-bundles/page.tsx');
  const service = read('apps/marketplace-api/src/starter-bundle.service.ts');
  const rbac = read('apps/marketplace-api/src/platform-rbac-seed.ts');
  const migration = read('apps/marketplace-api/prisma/migrations/20260928130000_starter_bundle_rbac/migration.sql');
  assert.match(app, /starter-bundles', requirePlatformOperator, P\('starter_bundles\.read'\)/);
  assert.match(app, /starter-bundles', requirePlatformOperator, P\('starter_bundles\.manage'\)/);
  assert.match(app, /bundleId\/publish', requirePlatformOperator, P\('starter_bundles\.publish'\)/);
  assert.match(app, /bundleId\/withdraw', requirePlatformOperator, P\('starter_bundles\.publish'\)/);
  assert.match(rbac, /marketplace_operator[\s\S]*starter_bundles\.manage[\s\S]*starter_bundles\.publish/);
  assert.match(rbac, /auditor[\s\S]*starter_bundles\.read/);
  assert.match(migration, /starter_bundles\.manage/);
  assert.match(migration, /role\."key" = 'marketplace_operator'/);
  assert.match(proxy, /starter-bundles/);
  assert.match(page, /Create draft bundle/);
  assert.match(page, /Internal reason/);
  assert.match(service, /platformAuditEvent\.create/);
});

test('required CI certifies bundle lifecycle against the migrated Marketplace PostgreSQL database', () => {
  const workflow = read('.github/workflows/pr-validation.yml');
  const packageJson = JSON.parse(read('apps/marketplace-api/package.json'));
  const drill = read('apps/marketplace-api/scripts/starter-bundle-postgres-certification.ts');
  assert.equal(packageJson.scripts['certify:starter-bundles:postgres'], 'tsx scripts/starter-bundle-postgres-certification.ts');
  assert.match(workflow, /Certify starter-bundle lifecycle against migrated PostgreSQL/);
  assert.match(workflow, /npm run certify:starter-bundles:postgres/);
  assert.match(drill, /starter_bundle_created,starter_bundle_published,starter_bundle_withdrawn/);
  assert.match(drill, /await cleanup\(\)/);
  assert.doesNotMatch(drill, /deleteMany\(\{\}\)|DROP\s+(TABLE|SCHEMA|DATABASE)/i);
});

test('required CI executes the real Platform Admin browser bundle journeys', () => {
  const workflow = read('.github/workflows/pr-validation.yml');
  const spec = read('apps/platform-admin/e2e/09-starter-bundles.spec.ts');
  assert.match(workflow, /platform-admin-e2e:/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /working-directory: apps\/platform-admin\s+run: npm run e2e/);
  assert.match(spec, /creates, publishes and withdraws a curated starter bundle/);
  assert.match(spec, /auditor can inspect bundles but cannot mutate them/);
});

test('Phase E certifies linked-school bundle discovery and paid acquisition across two databases', () => {
  const workflow = read('.github/workflows/phase-e-commerce-certification.yml');
  const drill = read('apps/marketplace-api/scripts/identity-registration-entitlement-live-drill.js');
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /working-directory:\s*packages\/plugin-cli\s+run:\s*npm ci/);
  assert.match(workflow, /Live identity, installation-registration, and entitlement-cache drill/);
  assert.match(drill, /StarterBundleService/);
  assert.match(drill, /linked school discovers the published mixed starter bundle over real HTTP/);
  assert.match(drill, /paid order is sourced from the server-resolved bundle plan/);
  assert.match(drill, /school fetches, verifies, and caches the real signed entitlement over live HTTP/);
  assert.match(drill, /signedPluginPackage/);
  assert.match(drill, /new PluginPackageVerifier\(\)/);
  assert.match(drill, /injected second-plugin failure reports the completed first member/);
  assert.match(drill, /retry reuses the completed member and activates both signed packages/);
  assert.match(drill, /independent removal preserves plugin-owned data by default/);
  assert.match(drill, /bundle reinstall restores the removed member without replacing the paid member/);
});
