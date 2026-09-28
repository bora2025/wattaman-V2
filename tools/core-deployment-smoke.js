#!/usr/bin/env node

const assert = require('node:assert/strict');

const baseUrl = (process.env.CORE_SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function waitForReady(attempts = 60) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await request('/api/health/ready');
      if (result.response.ok && result.body?.status === 'ready') return result.body;
    } catch {
      // The gateway may still be starting. Retry with the bounded delay below.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Core deployment did not become ready at ${baseUrl}`);
}

async function run() {
  await waitForReady();

  const version = await request('/api/version');
  assert.equal(version.response.status, 200, 'version endpoint must be available');
  assert.equal(version.body?.distribution, 'core', 'runtime must identify itself as the core distribution');

  const initialStatus = await request('/api/installation/status');
  assert.equal(initialStatus.response.status, 200, 'installation status must be available');
  assert.equal(initialStatus.body?.state, 'ready', 'the database must begin as a fresh installation');

  const setup = await request('/setup', { headers: { accept: 'text/html' } });
  assert.equal(setup.response.status, 200, 'the setup UI must be present in the core web artifact');

  for (const absentPath of ['/admin/attendance', '/admin/timetable', '/admin/examinations']) {
    const absent = await request(absentPath, { headers: { accept: 'text/html' } });
    assert.equal(absent.response.status, 404, `${absentPath} must not be compiled into a fresh core artifact`);
  }

  const install = await request('/api/installation/install', {
    method: 'POST',
    body: JSON.stringify({
      schoolName: 'Core Smoke School',
      schoolSlug: 'core-smoke-school',
      locale: 'en-US',
      timezone: 'Asia/Phnom_Penh',
      currency: 'USD',
      ownerName: 'Core Smoke Owner',
      ownerEmail: 'owner@core-smoke.invalid',
      ownerPassword: 'CoreSmokePassword2026!',
    }),
  });
  assert.ok(install.response.ok, `fresh installation failed (${install.response.status}): ${JSON.stringify(install.body)}`);

  const installedStatus = await request('/api/installation/status');
  assert.equal(installedStatus.response.status, 200);
  assert.equal(installedStatus.body?.state, 'installed', 'installation must persist successfully');
  assert.equal(installedStatus.body?.installation?.schoolSlug, 'core-smoke-school');

  const repeatedInstall = await request('/api/installation/install', {
    method: 'POST',
    body: JSON.stringify({
      schoolName: 'Second School', schoolSlug: 'second-school', locale: 'en-US',
      timezone: 'Asia/Phnom_Penh', currency: 'USD', ownerName: 'Other Owner',
      ownerEmail: 'other@core-smoke.invalid', ownerPassword: 'AnotherPassword2026!',
    }),
  });
  assert.ok(repeatedInstall.response.status >= 400, 'a configured installation must reject a second install');

  console.log(JSON.stringify({
    status: 'passed', baseUrl, distribution: version.body.distribution,
    schoolSlug: installedStatus.body.installation.schoolSlug,
    excludedPages: ['/admin/attendance', '/admin/timetable', '/admin/examinations'],
  }, null, 2));
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = { request, waitForReady, run };
