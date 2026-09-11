const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('LC2-017: core identity includes recovery, MFA and core-safe administration', () => {
  const auth = read('backend/src/auth/auth.service.ts');
  const controller = read('backend/src/auth/auth.controller.ts');
  assert.match(auth, /getDistribution\(\) === 'core'/);
  assert.match(controller, /forgot-password/);
  assert.match(controller, /mfa\/setup/);
  assert.match(controller, /mfa\/enable/);
  assert.match(read('backend/src/auth/mfa.service.ts'), /aes-256-gcm/);
});

test('LC2-018: marketplace is the only core acquisition entry', () => {
  const controller = read('backend/src/marketplace/marketplace-identity.controller.ts');
  const commerce = read('backend/src/marketplace/marketplace-commerce.controller.ts');
  const page = read('frontend/app/admin/plugins/page.tsx');
  assert.match(controller, /link\/start/);
  assert.match(controller, /link\/revoke/);
  assert.match(commerce, /@Get\('catalog'\)/);
  assert.match(commerce, /plugins\/:pluginId\/:version\/install/);
  assert.doesNotMatch(page, /type="file"|Inspect package|signed package/i);
});

test('LC2 core plugin host does not compose legacy parent or messaging routes', () => {
  const pluginsModule = read('backend/src/plugins/plugins.module.ts');
  assert.doesNotMatch(pluginsModule, /ParentModule|\.\.\/parent\/parent\.module/);
  assert.match(pluginsModule, /PluginRealtimeGateway/);
  assert.doesNotMatch(read('backend/src/plugins/plugin-realtime.service.ts'), /MessagesGateway|\.\.\/parent\//);
});

test('LC2-019: billing lifecycle keeps recovery open while suspending normal APIs', () => {
  const billing = read('backend/src/marketplace/school-billing-control.service.ts');
  const guard = read('backend/src/marketplace/school-billing-access.guard.ts');
  assert.match(billing, /platform_billing_final_notice/);
  assert.match(billing, /platform_billing_suspended/);
  assert.match(billing, /platform_billing_reactivated/);
  assert.match(guard, /HttpStatus\.PAYMENT_REQUIRED/);
  assert.match(guard, /\/auth/);
  assert.match(guard, /billing-control/);
});

test('LC2-020: backup and restore preserve and verify schema lineage', () => {
  assert.match(read('backend/scripts/backup-database.js'), /schemaLineage/);
  assert.match(read('backend/scripts/restore-database.js'), /schema lineage verification failed/);
  assert.match(read('backend/scripts/backup-restore-drill.js'), /exactMatch/);
});

test('LC2-021 and LC2-022: update recovery and core operations remain composed', () => {
  const updates = read('backend/src/updates/updates.service.ts');
  const registry = read('backend/src/distribution/module-registry.ts');
  assert.match(updates, /recovery_required/);
  assert.match(updates, /maintenanceFlagPath/);
  for (const name of ['AuditModule', 'BackupModule', 'HealthModule', 'UpdatesModule', 'ObservabilityModule']) {
    assert.match(registry, new RegExp(`module: '${name}'.+classification: 'core'`));
  }
});

test('LC2-023: legacy-full remains the default and composes every registered module', () => {
  assert.match(read('backend/src/config/environment.ts'), /WATTANAM_DISTRIBUTION\?\.trim\(\)\.toLowerCase\(\) \|\| 'legacy-full'/);
  assert.match(read('backend/src/distribution/module-registry.ts'), /distribution === 'legacy-full' \|\|/);
  assert.match(read('backend/scripts/deploy-migrations.js'), /distribution === 'legacy-full'.+prisma\/schema\.prisma/);
});
