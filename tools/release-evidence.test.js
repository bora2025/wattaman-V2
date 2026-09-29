'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const script = path.join(__dirname, 'release-evidence.js');
const digest = `sha256:${'a'.repeat(64)}`;

function generate(environment = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-evidence-'));
  const output = path.join(directory, 'evidence.json');
  const result = spawnSync(process.execPath, [
    script,
    '--version', '0.2.0-beta.1',
    '--channel', 'beta',
    '--api', `ghcr.io/bora2025/wattaman-V2/api@${digest}`,
    '--web', `ghcr.io/bora2025/wattaman-V2/web@${digest}`,
    '--gateway', `ghcr.io/bora2025/wattaman-V2/gateway@${digest}`,
    '--output', output,
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, ...environment } });
  return { directory, output, result };
}

test('records the immutable GitHub Actions signing identity and run coordinates', () => {
  const generated = generate({
    GITHUB_REPOSITORY: 'bora2025/wattaman-V2',
    GITHUB_WORKFLOW_REF: 'bora2025/wattaman-V2/.github/workflows/core-release.yml@refs/heads/main',
    GITHUB_RUN_ID: '123456789',
    GITHUB_RUN_ATTEMPT: '2',
  });
  try {
    assert.equal(generated.result.status, 0, generated.result.stderr);
    const evidence = JSON.parse(fs.readFileSync(generated.output, 'utf8'));
    assert.equal(evidence.source.repository, 'bora2025/wattaman-V2');
    assert.equal(evidence.source.workflowRef, 'bora2025/wattaman-V2/.github/workflows/core-release.yml@refs/heads/main');
    assert.equal(evidence.source.runId, '123456789');
    assert.equal(evidence.source.runAttempt, '2');
    assert.match(evidence.source.commit, /^[a-f0-9]{40}$/);
  } finally {
    fs.rmSync(generated.directory, { recursive: true, force: true });
  }
});

test('renderer refuses evidence that lacks the approved signing identity', () => {
  const generated = generate();
  try {
    assert.equal(generated.result.status, 0, generated.result.stderr);
    const evidence = JSON.parse(fs.readFileSync(generated.output, 'utf8'));
    delete evidence.source.repository;
    fs.writeFileSync(generated.output, `${JSON.stringify(evidence, null, 2)}\n`);
    const output = path.join(generated.directory, 'school-release.json');
    const render = spawnSync(process.execPath, [path.join(__dirname, 'render-school-release.js'), '--evidence', generated.output, '--output', output], { cwd: root, encoding: 'utf8' });
    assert.notEqual(render.status, 0);
    assert.match(render.stderr, /missing its GitHub repository identity/);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(generated.directory, { recursive: true, force: true });
  }
});
