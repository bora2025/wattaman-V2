'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plugin = require('../backend/index');
const manifest = require('../plugin.json');
const pages = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'page.json'), 'utf8'));

async function activationContract() {
  const routes = [], navigation = [], permissions = [];
  const context = {
    routes: { register(value) { routes.push(value); } },
    navigation: { register(values) { navigation.push(...values); } },
    permissions: { register(values) { permissions.push(...values); } },
    database: { query: async () => [], execute: async () => ({ count: 0 }), transaction: async callback => callback({ query: async () => [], execute: async () => ({ count: 0 }) }) },
  };
  await plugin.activate(context);
  return { routes, navigation, permissions };
}

test('every declarative data source has a registered backend route', async () => {
  const { routes } = await activationContract();
  const registered = routes.map(route => ({ method: route.method.toUpperCase(), pattern: new RegExp(`^${route.path.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g, '[^/]+')}$`) }));
  const missing = [];
  for (const page of pages.pages) for (const source of page.dataSources || []) {
    const key = `${source.method.toUpperCase()} ${source.path}`;
    if (!registered.some(route => route.method === source.method.toUpperCase() && route.pattern.test(source.path))) missing.push(`${page.id}: ${key}`);
  }
  assert.deepEqual(missing, []);
});

test('declarative data source permissions match their backend routes', async () => {
  const { routes } = await activationContract();
  const mismatches = [];
  for (const page of pages.pages) for (const source of page.dataSources || []) {
    const route = routes.find(candidate => candidate.method.toUpperCase() === source.method.toUpperCase()
      && new RegExp(`^${candidate.path.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g, '[^/]+')}$`).test(source.path));
    if (route && route.permission !== source.permission) {
      mismatches.push(`${page.id}: ${source.method} ${source.path} uses ${source.permission}, backend uses ${route.permission}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('page and route permissions are declared and registered', async () => {
  const { routes, permissions } = await activationContract();
  const declared = new Set(manifest.permissions);
  const registered = new Set(permissions.map(permission => permission.id));
  const used = new Set();
  for (const page of pages.pages) {
    if (page.permission) used.add(page.permission);
    for (const source of page.dataSources || []) if (source.permission) used.add(source.permission);
  }
  for (const route of routes) if (route.permission) used.add(route.permission);
  assert.deepEqual([...used].filter(permission => !declared.has(permission)), [], 'used permissions missing from manifest');
  assert.deepEqual([...used].filter(permission => !registered.has(permission)), [], 'used permissions not registered at activation');
  assert.equal(permissions.length, registered.size, 'permissions must be registered exactly once');
});

test('runtime and manifest navigation identifiers are unique', async () => {
  const { navigation } = await activationContract();
  const runtimeIds = navigation.map(item => item.id);
  const manifestIds = manifest.navigation.map(item => item.id);
  assert.equal(new Set(runtimeIds).size, runtimeIds.length);
  assert.equal(new Set(manifestIds).size, manifestIds.length);
  assert.deepEqual(new Set(runtimeIds), new Set(manifestIds));
});

test('transactional handlers declare the durable-events capability', () => {
  const backendDirectory = path.join(__dirname, '..', 'backend');
  const transactionalFiles = fs.readdirSync(backendDirectory)
    .filter(file => file.endsWith('.js'))
    .filter(file => fs.readFileSync(path.join(backendDirectory, file), 'utf8').includes('database.transaction'));
  assert.ok(transactionalFiles.length > 0, 'expected at least one transactional backend handler');
  assert.ok(
    manifest.capabilities.includes('events.durable'),
    `events.durable is required by transactional handlers: ${transactionalFiles.join(', ')}`,
  );
});

test('all explicit plugin table identifiers remain inside the plugin namespace', () => {
  for (const migration of manifest.migrations) {
    const sql = fs.readFileSync(path.join(__dirname, '..', migration.path), 'utf8');
    const tableReferences = [...sql.matchAll(/\bplugin_[a-zA-Z0-9_]+/g)].map(match => match[0]);
    const foreign = tableReferences.filter(name => !name.startsWith('plugin_wattanam_organizing_management_'));
    assert.deepEqual(foreign, [], `${migration.id} references non-plugin tables: ${foreign.join(', ')}`);
  }
});
