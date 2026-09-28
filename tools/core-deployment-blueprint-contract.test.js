const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const compose = fs.readFileSync(path.join(root, 'docker-compose.core.yml'), 'utf8');

test('self-hosted core blueprint requires digest inputs and persists all school state', () => {
  for (const image of ['POSTGRES_IMAGE', 'API_IMAGE', 'WEB_IMAGE', 'GATEWAY_IMAGE']) assert.match(compose, new RegExp(`image: \\$\\{${image}:\\?`));
  assert.equal((compose.match(/^\s+WATTANAM_DISTRIBUTION: core$/gm) || []).length, 4);
  assert.match(compose, /NEXT_PUBLIC_WATTANAM_DISTRIBUTION: core/);
  assert.match(compose, /postgres_data:\/var\/lib\/postgresql\/data/);
  assert.match(compose, /api_data:\/data/);
  assert.match(compose, /backup-recovery-set\.js/);
  assert.match(compose, /restore-recovery-set\.js/);
  assert.match(compose, /postgres_restore_data:/);
  assert.match(compose, /restore_data:/);
  assert.doesNotMatch(compose, /build:\s/);
  assert.doesNotMatch(compose, /legacy-full/);
});

test('Railway school release renderer and verifier bind both app services to core', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-core-blueprint-'));
  try {
    const evidenceFile = path.join(directory, 'evidence.json'); const output = path.join(directory, 'school-release.json');
    const digest = `sha256:${'a'.repeat(64)}`;
    fs.writeFileSync(evidenceFile, JSON.stringify({ version: '0.2.0', source: { commit: 'abc123' }, generatedAt: '2026-09-26T00:00:00.000Z', images: { api: `example/api@${digest}`, web: `example/web@${digest}`, gateway: `example/gateway@${digest}` } }));
    const render = spawnSync(process.execPath, [path.join(root, 'tools', 'render-school-release.js'), '--evidence', evidenceFile, '--output', output], { encoding: 'utf8' });
    assert.equal(render.status, 0, render.stderr);
    const value = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(value.services.api.variables.WATTANAM_DISTRIBUTION, 'core');
    assert.equal(value.services.web.variables.WATTANAM_DISTRIBUTION, 'core');
    assert.equal(value.services.web.variables.NEXT_PUBLIC_WATTANAM_DISTRIBUTION, 'core');
    const verify = spawnSync(process.execPath, [path.join(root, 'tools', 'verify-school-release.js'), output], { encoding: 'utf8' });
    assert.equal(verify.status, 0, verify.stderr);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
