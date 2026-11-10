const assert = require('node:assert/strict');
const test = require('node:test');
const { check, probe } = require('./check-uptime');

const reply = (status, text = '') => async () => ({ status, text: async () => text });
const noPause = async () => {};

test('an endpoint that answers as expected is up', async () => {
  const result = await probe({ name: 'school', url: 'https://x', expectText: '"status":"ok"' }, reply(200, '{"status":"ok"}'));
  assert.equal(result.ok, true);
});

test('wrong status or missing text is down', async () => {
  assert.match((await probe({ name: 'x', url: 'https://x' }, reply(502))).reason, /HTTP 502/);
  assert.match((await probe({ name: 'x', url: 'https://x', expectText: 'ready' }, reply(200, 'starting'))).reason, /did not contain/);
});

test('a single dropped request is retried and not reported as an outage', async () => {
  let calls = 0;
  const flaky = async () => { calls += 1; if (calls === 1) throw new Error('ECONNRESET'); return { status: 200, text: async () => 'ok' }; };
  const [result] = await check([{ name: 'x', url: 'https://x' }], flaky, noPause);
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test('an endpoint still failing after the retry is down', async () => {
  const [result] = await check([{ name: 'x', url: 'https://x' }], reply(503), noPause);
  assert.equal(result.ok, false);
});
