const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const release = fs.readFileSync(path.join(root, '.github', 'workflows', 'core-release.yml'), 'utf8');
const promotion = fs.readFileSync(path.join(root, '.github', 'workflows', 'promote-core-release.yml'), 'utf8');

test('core release builds, scans and publishes only physical core images', () => {
  assert.match(release, /npm run build:core/);
  assert.match(release, /npm run architecture:clean-core:gate/);
  assert.match(release, /context: backend\s+file: backend\/Dockerfile\.core\s+push: true/);
  assert.match(release, /context: frontend\s+file: frontend\/Dockerfile\.core\s+push: true/);
  assert.doesNotMatch(release, /npm run build &&/);
  assert.match(release, /npm audit --omit=dev --audit-level=moderate/);
  assert.equal((release.match(/uses: aquasecurity\/trivy-action@0\.28\.0/g) || []).length, 3);
  assert.match(release, /image-ref: ghcr\.io\/\$\{\{ github\.repository \}\}\/api@\$\{\{ steps\.api\.outputs\.digest \}\}/);
  assert.match(release, /image-ref: ghcr\.io\/\$\{\{ github\.repository \}\}\/web@\$\{\{ steps\.web\.outputs\.digest \}\}/);
  assert.match(release, /image-ref: ghcr\.io\/\$\{\{ github\.repository \}\}\/gateway@\$\{\{ steps\.gateway\.outputs\.digest \}\}/);
  assert.equal((release.match(/severity: HIGH,CRITICAL/g) || []).length, 3);
  assert.equal((release.match(/ignore-unfixed: false/g) || []).length, 3);
  assert.equal((release.match(/exit-code: '1'/g) || []).length, 3);
  assert.equal((release.match(/continue-on-error: true/g) || []).length, 3);
  assert.match(release, /Retain immutable digest vulnerability reports\s+if: always\(\)/);
  assert.match(release, /Enforce immutable digest vulnerability gate\s+if: always\(\)/);
  for (const outcome of ['api-scan', 'web-scan', 'gateway-scan']) {
    assert.match(release, new RegExp(`steps\\.${outcome}\\.outcome`));
  }
  const gate = release.indexOf('npm run architecture:clean-core:gate');
  const apiPush = release.indexOf('id: api');
  const webPush = release.indexOf('id: web');
  const apiScan = release.indexOf('Scan immutable API digest');
  const scanGate = release.indexOf('Enforce immutable digest vulnerability gate');
  const signing = release.indexOf('Keyless-sign immutable image digests');
  const publish = release.indexOf('Publish signed repository beta metadata');
  assert.ok(gate > 0 && gate < apiPush && gate < webPush, 'clean-core gate must run before image publication');
  assert.ok(apiScan > apiPush && apiScan > webPush, 'digest scans must run after image publication resolves immutable digests');
  assert.ok(apiScan < scanGate && scanGate < signing && signing < publish, 'all scans must pass before signing and marketplace publication');
  for (const report of ['api-trivy.json', 'web-trivy.json', 'gateway-trivy.json']) assert.match(release, new RegExp(report.replace('.', '\\.')));
});

test('stable promotion is explicitly metadata-only and cannot rebuild different images', () => {
  assert.match(promotion, /Promote existing beta metadata and digests/);
  assert.doesNotMatch(promotion, /docker\/build-push-action|docker build|npm run build/);
  assert.match(promotion, /node tools\/promote-core-release\.js/);
});
