const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('PR validation boots and installs the physical core deployment', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/pr-validation.yml'), 'utf8');
  assert.match(workflow, /core-deployment-smoke:/);
  assert.match(workflow, /docker build -f backend\/Dockerfile\.core -t wattanam-api-core:smoke backend/);
  assert.match(workflow, /docker build -f frontend\/Dockerfile\.core -t wattanam-web-core:smoke frontend/);
  assert.match(workflow, /test ! -e node_modules\/typescript/);
  assert.match(workflow, /test ! -e node_modules\/jest/);
  assert.match(workflow, /test ! -e node_modules\/@nestjs\/cli/);
  assert.match(workflow, /test ! -e prisma\/schema\.prisma/);
  assert.match(workflow, /require\.resolve\('\.\/generated\/core-client'\)/);
  assert.match(workflow, /docker compose --env-file \.env\.core-smoke -f docker-compose\.core\.yml up -d/);
  assert.match(workflow, /node tools\/core-deployment-smoke\.js/);
  assert.match(workflow, /node scripts\/verify-fresh-core-database\.js/);
  assert.match(workflow, /--profile operations run --rm backup/);
  assert.match(workflow, /--profile recovery-drill run --rm restore/);
  assert.match(workflow, /restored school identity mismatch/);
  assert.match(workflow, /REQUIRE_PLUGIN_BACKUP_CONTRACTS=true/);
  assert.match(workflow, /wattanam-recovery-set-v2/);
  assert.match(workflow, /legacyExceptionCount/);
  assert.match(workflow, /wattanam\.smoke\/1\.0\.0\/plugin\.json/);
  assert.match(workflow, /mutable-plugin-state/);
  assert.match(workflow, /if: always\(\)/);
});

test('released-image workflow verifies and boots retained immutable digests without rebuilding', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/core-released-image-smoke.yml'), 'utf8');
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /run-id: \$\{\{ inputs\.release_run_id \}\}/);
  assert.match(workflow, /verify-school-release\.js release-artifact\/school-release\.json/);
  assert.match(workflow, /verify-core-image-signatures\.js --blueprint release-artifact\/school-release\.json/);
  assert.ok(workflow.indexOf('docker/login-action@v3') < workflow.indexOf('verify-core-image-signatures.js'));
  assert.match(workflow, /services\.api\.image/);
  assert.match(workflow, /services\.web\.image/);
  assert.match(workflow, /services\.gateway\.image/);
  assert.doesNotMatch(workflow, /docker build/);
  assert.match(workflow, /node tools\/core-deployment-smoke\.js/);
  assert.match(workflow, /node scripts\/verify-fresh-core-database\.js/);
  assert.match(workflow, /--profile operations run --rm backup/);
  assert.match(workflow, /--profile recovery-drill run --rm restore/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /test ! -f \.env\.core-released-smoke \|\| docker compose/);
});

test('core runtime image carries database and plugin-recovery verifiers', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'backend/Dockerfile.core'), 'utf8');
  assert.match(dockerfile, /scripts\/verify-fresh-core-database\.js/);
  assert.match(dockerfile, /scripts\/plugin-recovery-contract\.js/);
});

test('core backup service receives the strict plugin recovery contract switch', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.core.yml'), 'utf8');
  const backupService = compose.match(/\n  backup:\r?\n([\s\S]*?)\n  postgres_restore:/)?.[1] || '';
  assert.match(backupService, /REQUIRE_PLUGIN_BACKUP_CONTRACTS: \$\{REQUIRE_PLUGIN_BACKUP_CONTRACTS:-false\}/);
});

test('smoke harness verifies a fresh core identity, setup and absence of optional pages', () => {
  const source = fs.readFileSync(path.join(root, 'tools/core-deployment-smoke.js'), 'utf8');
  assert.match(source, /distribution, 'core'/);
  assert.match(source, /state, 'ready'/);
  assert.match(source, /state, 'installed'/);
  assert.match(source, /\/api\/installation\/install/);
  assert.match(source, /\/admin\/attendance/);
  assert.match(source, /\/admin\/timetable/);
  assert.match(source, /\/admin\/examinations/);
  assert.match(source, /repeatedInstall\.response\.status >= 400/);
});
