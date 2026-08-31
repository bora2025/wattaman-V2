'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseDnsInstructions, decideVerifyState } = require('./manage-custom-domain');

const SCRIPT = path.join(__dirname, 'manage-custom-domain.js');
function run(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

test('parseDnsInstructions reads several plausible Railway response shapes', () => {
  assert.deepStrictEqual(parseDnsInstructions({ cname: 'a.up.railway.app' }), { type: 'CNAME', target: 'a.up.railway.app' });
  assert.deepStrictEqual(parseDnsInstructions({ target: 'b.up.railway.app' }), { type: 'CNAME', target: 'b.up.railway.app' });
  assert.deepStrictEqual(parseDnsInstructions({ dnsRecords: [{ value: 'c.up.railway.app' }] }), { type: 'CNAME', target: 'c.up.railway.app' });
});

test('parseDnsInstructions fails loudly, not silently, when no known shape matches', () => {
  assert.throws(() => parseDnsInstructions({ somethingElse: true }), /Could not find a CNAME target/);
});

test('CLI: unknown action prints usage instead of crashing', () => {
  const result = run(['bogus-action']);
  assert.match(result.stdout, /Usage: node tools\/manage-custom-domain\.js/);
});

test('CLI: request without required arguments fails clearly', () => {
  const result = run(['request', '--domain', 'school.example.org']);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /--project.*--school-slug.*--canonical-origin|required/i);
});

test('CLI: request rejects an invalid hostname before touching Railway', () => {
  const result = run(['request', '--domain', 'not a hostname', '--project', 'p1', '--school-slug', 's', '--canonical-origin', 'https://x.up.railway.app']);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /does not look like a valid hostname/);
});

test('CLI: request in dry-run mode (default) prints the planned command without executing anything', () => {
  const result = run(['request', '--domain', 'school.example.org', '--project', 'proj-1', '--school-slug', 'angkor', '--canonical-origin', 'https://angkor.up.railway.app']);
  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.mode, 'dry-run');
  assert.deepStrictEqual(parsed.command, ['railway', 'domain', 'school.example.org', '--service', 'gateway', '--project', 'proj-1', '--environment', 'production', '--json']);
});

function withJournal(journal, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-domain-test-'));
  const file = path.join(dir, 'journal.json');
  fs.writeFileSync(file, JSON.stringify(journal));
  try { return fn(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// decideVerifyState is tested directly with a constructed dnsCheckResult rather than through a
// real "record not found yet" DNS lookup: a genuinely nonexistent name can resolve as either a
// fast NXDOMAIN or a slow ETIMEOUT depending on the resolver a given network/sandbox uses (this
// was found empirically -- a real ETIMEOUT surfaced in this environment against a nonexistent
// subdomain, taking 25+ seconds and landing on "error" rather than "pending"). The live
// separate *.live-test.js tier proves the real DNS integration end to end; this covers the
// pending/error split precisely and fast, independent of resolver behavior.
test('decideVerifyState: not_yet_propagated stays pending, any other DNS error becomes error, a match becomes verified', () => {
  assert.strictEqual(decideVerifyState({ matched: false, error: 'not_yet_propagated' }), 'pending');
  assert.strictEqual(decideVerifyState({ matched: false, error: 'dns_error:ETIMEOUT' }), 'error');
  assert.strictEqual(decideVerifyState({ matched: false, error: null }), 'pending');
  assert.strictEqual(decideVerifyState({ matched: true, error: null }), 'verified');
});

test('CLI: activate fails to error state (and never calls Railway) when the TLS/content probe fails', () => {
  withJournal({
    schemaVersion: 1, domain: 'this-domain-should-not-exist-wattanam-drill.invalid', apiService: 'api',
    canonicalOrigin: 'https://angkor.up.railway.app', state: 'verified', history: [],
  }, (file) => {
    const result = run(['activate', '--journal', file]);
    assert.strictEqual(result.status, 2);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.state, 'error');
    assert.strictEqual(parsed.probe.ok, false);
    const journal = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(journal.state, 'error');
  });
});

test('CLI: activate refuses to run from a state other than verified', () => {
  withJournal({ schemaVersion: 1, domain: 'school.example.org', state: 'pending', history: [] }, (file) => {
    const result = run(['activate', '--journal', file]);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Cannot activate from state "pending"/);
  });
});

test('CLI: rollback in dry-run mode (default) prints the planned CORS revert without executing it', () => {
  withJournal({ schemaVersion: 1, domain: 'school.example.org', apiService: 'api', canonicalOrigin: 'https://angkor.up.railway.app', state: 'active', history: [] }, (file) => {
    const result = run(['rollback', '--journal', file]);
    assert.strictEqual(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.mode, 'dry-run');
    assert.deepStrictEqual(parsed.command, ['railway', 'variable', 'set', 'CORS_ORIGINS=https://angkor.up.railway.app', '--service', 'api', '--skip-deploys', '--json']);
    const journal = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(journal.state, 'active', 'dry-run must not mutate the journal state');
  });
});
