'use strict';

// Kept separate from custom-domain-dns.test.js deliberately: these hit real public DNS and
// HTTPS (no mocking at all, in a file with no other mocks to leak from), proving the
// underlying mechanism genuinely works against the real internet -- distinct from proving
// the full Railway-specific flow, which needs a real project and a real domain this repo
// does not have. Run explicitly (not part of the default fast test loop) since it requires
// network access and can be slow/flaky on a bad connection.

const test = require('node:test');
const assert = require('node:assert');
const { checkCnameRecord, probeCustomDomain } = require('./custom-domain-dns');

test('LIVE: checkCnameRecord against a real, well-known public CNAME (www.github.com -> github.com)', async () => {
  const result = await checkCnameRecord('www.github.com', 'github.com');
  assert.strictEqual(result.matched, true, `expected www.github.com to CNAME to github.com, got: ${JSON.stringify(result)}`);
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
