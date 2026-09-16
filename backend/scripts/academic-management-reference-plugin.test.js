'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const plugin = require('../../plugins/wattanam.academic-management/backend/index.js');

function json(relative) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', relative), 'utf8'));
}

async function activate(database = { query: async () => [], execute: async () => ({ count: 0 }) }) {
  const routes = [];
  const permissions = [];
  const navigation = [];
  await plugin.activate({
    logger: { log: () => undefined }, database,
    routes: { register: (value) => { routes.push(value); return () => undefined; } },
    permissions: { register: (value) => { permissions.push(...value); return () => undefined; } },
    navigation: { register: (value) => { navigation.push(...value); return () => undefined; } },
  });
  return { routes, permissions, navigation };
}

test('registers the initial department routes, permissions, and navigation', async () => {
  const result = await activate();
  assert.deepEqual(result.routes.map((route) => `${route.method}:${route.path}`), ['GET:departments']);
  assert.deepEqual(result.permissions.map((permission) => permission.id), [
    'wattanam.academic-management.view', 'wattanam.academic-management.manage',
  ]);
  assert.equal(result.navigation[0].href, '/plugins/wattanam.academic-management/departments');
});

test('exposes read-only departments without database writes', async () => {
  const calls = [];
  const result = await activate({
    query: async () => [],
    execute: async (sql, params) => { calls.push({ sql, params }); return { count: 1 }; },
  });
  await result.routes[0].handler();
  assert.equal(calls.length, 0);
});

test('manifest, UI, and additive namespaced migrations align with the preflight contract', () => {
  const manifest = json('plugins/wattanam.academic-management/plugin.json');
  const page = json('plugins/wattanam.academic-management/frontend/page.json');
  assert.equal(page.pages[0].permission, 'wattanam.academic-management.view');
  assert.equal(page.pages[0].dataSources.length, 1);
  assert.equal(page.pages[0].dataSources[0].method, 'GET');
  assert.equal(manifest.migrations.length, 3);
  for (const migration of manifest.migrations) {
    const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management', migration.path), 'utf8');
    assert.equal((sql.match(/;/g) || []).length, 1);
    assert.match(sql, /CREATE TABLE "plugin_wattanam_academic_management_/);
    assert.doesNotMatch(sql, /^\s*(?:DROP|ALTER|TRUNCATE|DELETE)\b/im);
  }
  const enrollmentSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management/migrations/003_create_enrollment_interval.sql'), 'utf8');
  assert.match(enrollmentSql, /academic_enrollment_valid_range/);
  assert.match(enrollmentSql, /academic_enrollment_one_current/);
});
