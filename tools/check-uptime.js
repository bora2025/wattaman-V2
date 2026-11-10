#!/usr/bin/env node
'use strict';

// Uptime probe for the live school and marketplace. Fails (so GitHub alerts) when any endpoint is
// down, slow, or answering with the wrong thing. Each endpoint is retried once so a single dropped
// connection is not paged as an outage.
//
// Env: UPTIME_TARGETS = JSON array of { name, url, expectStatus?, expectText?, maxMs? }.

const DEFAULT_MAX_MS = 10_000;

async function probe(target, fetchImpl = fetch) {
  const started = Date.now();
  try {
    const response = await fetchImpl(target.url, { redirect: 'manual', signal: AbortSignal.timeout(target.maxMs || DEFAULT_MAX_MS) });
    const body = await response.text();
    const ms = Date.now() - started;
    const expected = target.expectStatus || 200;
    if (response.status !== expected) return { ok: false, ms, reason: `HTTP ${response.status} (expected ${expected})` };
    if (target.expectText && !body.includes(target.expectText)) return { ok: false, ms, reason: `response did not contain "${target.expectText}"` };
    return { ok: true, ms };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, reason: error.name === 'TimeoutError' ? 'timed out' : error.message };
  }
}

async function check(targets, fetchImpl = fetch, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const results = [];
  for (const target of targets) {
    let result = await probe(target, fetchImpl);
    if (!result.ok) { await pause(5_000); result = await probe(target, fetchImpl); }
    results.push({ name: target.name, ...result });
  }
  return results;
}

async function main(env = process.env) {
  const targets = JSON.parse(env.UPTIME_TARGETS || '[]');
  if (!Array.isArray(targets) || !targets.length) throw new Error('UPTIME_TARGETS must be a non-empty JSON array');
  const results = await check(targets);
  for (const result of results) process.stdout.write(`${result.ok ? 'UP  ' : 'DOWN'}  ${result.name}  ${result.ms}ms${result.reason ? `  ${result.reason}` : ''}\n`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });

module.exports = { check, probe };
