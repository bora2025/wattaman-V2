'use strict';

// Kept separate from custom-domain-dns.test.js deliberately: these hit real public DNS and
// HTTPS (no mocking at all, in a file with no other mocks to leak from), proving the
// underlying mechanism genuinely works against the real internet -- distinct from proving
// the full Railway-specific flow, which needs a real project and a real domain this repo
// does not have. Run explicitly (not part of the default fast test loop) since it requires
// network access and can be slow/flaky on a bad connection.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkCnameRecord, probeCustomDomain } = require('./custom-domain-dns');

const SCRIPT = path.join(__dirname, 'manage-custom-domain.js');

test('LIVE: checkCnameRecord against a real, well-known public CNAME (www.github.com -> github.com)', async () => {
  const result = await checkCnameRecord('www.github.com', 'github.com');
  assert.strictEqual(result.matched, true, `expected www.github.com to CNAME to github.com, got: ${JSON.stringify(result)}`);
});

test('LIVE: CLI verify transitions pending -> verified through real public DNS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-domain-live-test-'));
  const journalPath = path.join(dir, 'journal.json');
  fs.writeFileSync(journalPath, JSON.stringify({
    schemaVersion: 1,
    domain: 'www.github.com',
    dnsInstructions: { type: 'CNAME', target: 'github.com' },
    state: 'pending',
    history: [],
  }));
  try {
    const result = spawnSync(process.execPath, [SCRIPT, 'verify', '--journal', journalPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(result.stdout).state, 'verified');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    assert.strictEqual(journal.state, 'verified');
    assert.strictEqual(journal.history.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('LIVE: probeCustomDomain against a real public HTTPS endpoint proves the TLS+content mechanism actually works', async () => {
  const result = await probeCustomDomain('github.com', { healthPath: '/', expectedBodyIncludes: 'GitHub' });
  assert.strictEqual(result.tlsOk, true);
  assert.strictEqual(result.ok, true, `expected a real TLS+content match against github.com, got: ${JSON.stringify(result)}`);
});

test('LIVE: probeCustomDomain correctly fails closed against a domain that does not exist', async () => {
  const result = await probeCustomDomain('this-domain-should-not-exist-wattanam-drill.invalid');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.tlsOk, false);
});
