'use strict';

const test = require('node:test');
const assert = require('node:assert');
const dns = require('dns').promises;
const { checkCnameRecord, checkTxtRecord, probeCustomDomain } = require('./custom-domain-dns');

test('checkCnameRecord matches case- and trailing-dot-insensitively', async (t) => {
  t.mock.method(dns, 'resolveCname', async () => ['Target.Example.com.']);
  const result = await checkCnameRecord('school.example.org', 'target.example.com');
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.error, null);
});

test('checkCnameRecord reports not_yet_propagated distinctly from a real DNS error', async (t) => {
  t.mock.method(dns, 'resolveCname', async () => { const error = new Error('not found'); error.code = 'ENOTFOUND'; throw error; });
  const notYet = await checkCnameRecord('school.example.org', 'target.example.com');
  assert.strictEqual(notYet.matched, false);
  assert.strictEqual(notYet.error, 'not_yet_propagated');

  t.mock.method(dns, 'resolveCname', async () => { const error = new Error('refused'); error.code = 'EREFUSED'; throw error; });
  const realError = await checkCnameRecord('school.example.org', 'target.example.com');
  assert.strictEqual(realError.matched, false);
  assert.match(realError.error, /^dns_error:/);
});

test('checkCnameRecord reports a mismatch (wrong target) as not matched, not as an error', async (t) => {
  t.mock.method(dns, 'resolveCname', async () => ['someone-elses-target.example.net']);
  const result = await checkCnameRecord('school.example.org', 'target.example.com');
  assert.strictEqual(result.matched, false);
  assert.strictEqual(result.error, null);
  assert.deepStrictEqual(result.found, ['someone-elses-target.example.net']);
});

test('checkTxtRecord matches an exact value among multiple TXT records', async (t) => {
  t.mock.method(dns, 'resolveTxt', async () => [['unrelated=1'], ['wattanam-verify=abc123']]);
  const result = await checkTxtRecord('_wattanam-verify.school.example.org', 'wattanam-verify=abc123');
  assert.strictEqual(result.matched, true);
});

test('probeCustomDomain reports a TLS/network failure distinctly from an HTTP error status', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('certificate has expired'); };
  try {
    const result = await probeCustomDomain('bad-tls.example.org');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.tlsOk, false);
    assert.match(result.error, /certificate/);
  } finally { globalThis.fetch = originalFetch; }
});

test('probeCustomDomain fails when the response does not contain the expected content (wrong target, DNS hijack, etc.)', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '<html>Not our gateway</html>' });
  try {
    const result = await probeCustomDomain('school.example.org', { expectedBodyIncludes: 'wattanam-gateway-ok' });
    assert.strictEqual(result.tlsOk, true);
    assert.strictEqual(result.httpOk, true);
    assert.strictEqual(result.contentOk, false);
    assert.strictEqual(result.ok, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('probeCustomDomain passes when TLS, HTTP status, and content all line up', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => 'wattanam-gateway-ok' });
  try {
    const result = await probeCustomDomain('school.example.org', { expectedBodyIncludes: 'wattanam-gateway-ok' });
    assert.strictEqual(result.ok, true);
  } finally { globalThis.fetch = originalFetch; }
});

