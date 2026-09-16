'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const reference = require('../../plugins/wattanam.document-designer/backend/index.js');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8'));
}

function buildContext(overrides = {}) {
  const routes = [];
  const context = {
    pluginId: 'wattanam.document-designer',
    logger: { log: () => undefined },
    permissions: { register: () => () => undefined },
    navigation: { register: () => () => undefined },
    routes: { register: (route) => { routes.push(route); return () => undefined; } },
    database: {
      query: async () => [],
      execute: async () => ({ count: 0 }),
    },
    ...overrides,
  };
  return { context, routes };
}

async function activate(overrides = {}) {
  const built = buildContext(overrides);
  await reference.activate(built.context);
  const byKey = new Map(built.routes.map((route) => [`${route.method}:${route.path}`, route]));
  return { context: built.context, byKey, routes: built.routes };
}

test('registers document designer permissions, navigation, and route set', async () => {
  const permissionCalls = [];
  const navigationCalls = [];
  const built = buildContext({
    permissions: { register: (definitions) => { permissionCalls.push(definitions); return () => undefined; } },
    navigation: { register: (entries) => { navigationCalls.push(entries); return () => undefined; } },
  });

  await reference.activate(built.context);

  const routeKeys = built.routes.map((route) => `${route.method}:${route.path}`);
  assert.deepEqual(routeKeys, [
    'GET:templates',
    'GET:templates/:id',
    'GET:active/:documentType',
    'PUT:active/:documentType',
    'POST:templates',
    'PATCH:templates/:id',
    'PATCH:templates/:id/active',
    'DELETE:templates/:id',
  ]);
  assert.equal(permissionCalls.length, 1);
  assert.ok(permissionCalls[0].find((entry) => entry.id === 'wattanam.document-designer.view'));
  assert.ok(permissionCalls[0].find((entry) => entry.id === 'wattanam.document-designer.edit'));
  assert.equal(navigationCalls.length, 1);
  assert.equal(navigationCalls[0][0].href, '/plugins/wattanam.document-designer/templates');
  assert.deepEqual(reference.health(), { status: 'ready' });
});

test('template routes enforce validation and active-template behavior', async () => {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ kind: 'query', sql, params });
    if (sql.includes('WHERE "id" = $1') && sql.includes('documentType')) return [{ id: 't1', documentType: 'student' }];
    if (sql.includes('ORDER BY "id" FOR UPDATE')) return [{ id: 't1' }];
    if (sql.startsWith('SELECT * FROM') && sql.includes('"documentType" = $1')) return [{ id: 't1', documentType: 'student', isActive: true }];
    if (sql.startsWith('SELECT * FROM') && sql.includes('"id" = $1')) return [{ id: 't1', name: calls.some((entry) => entry.kind === 'execute' && entry.sql.startsWith('UPDATE')) ? 'Template B' : 'Template A', documentType: 'student' }];
    return [{ id: 't1', name: 'Template A', documentType: 'student', isActive: false }];
  };
  const execute = async (sql, params = []) => {
    calls.push({ kind: 'execute', sql, params });
    return { count: 1 };
  };

  const transaction = async (work) => work({ query, execute });
  const { byKey } = await activate({ database: { query, execute, transaction } });

  await assert.rejects(
    () => byKey.get('POST:templates').handler({ body: {} }),
    /name is required and must not exceed 120 characters/,
  );
  await assert.rejects(
    () => byKey.get('GET:active/:documentType').handler({ params: { documentType: 'invalid' } }),
    /documentType must be one of/,
  );

  const created = await byKey.get('POST:templates').handler({ body: { name: 'Template A', documentType: 'student', design: { blocks: [] } } });
  assert.equal(created.id, 't1');

  const updated = await byKey.get('PATCH:templates/:id').handler({ params: { id: 't1' }, body: { name: 'Template B', design: { blocks: [1] } } });
  assert.equal(updated.name, 'Template B');

  const active = await byKey.get('PATCH:templates/:id/active').handler({ params: { id: 't1' } });
  assert.deepEqual(active, { id: 't1', documentType: 'student', isActive: true });

  const savedActive = await byKey.get('PUT:active/:documentType').handler({ params: { documentType: 'student' }, body: { design: { blocks: [2] } } });
  assert.equal(savedActive.cardType, 'student');

  const deleted = await byKey.get('DELETE:templates/:id').handler({ params: { id: 't1' } });
  assert.deepEqual(deleted, { ok: true });

  assert.ok(calls.find((entry) => entry.kind === 'execute' && /INSERT INTO plugin_wattanam_document_designer_template/.test(entry.sql)));
  assert.ok(calls.find((entry) => entry.kind === 'execute' && /UPDATE plugin_wattanam_document_designer_template/.test(entry.sql)));
  assert.ok(calls.find((entry) => entry.kind === 'execute' && /DELETE FROM plugin_wattanam_document_designer_template/.test(entry.sql)));
  assert.equal(calls.some((entry) => entry.kind === 'query' && /^\s*(INSERT|UPDATE|DELETE)\b/i.test(entry.sql)), false);
});

test('declarative UI page descriptor aligns with plugin navigation and permissions', () => {
  const manifest = readJson('plugins/wattanam.document-designer/plugin.json');
  const page = readJson('plugins/wattanam.document-designer/frontend/page.json');

  assert.equal(page.schemaVersion, 2);
  assert.equal(page.kind, 'declarative-ui');
  assert.ok(Array.isArray(page.pages));
  assert.ok(page.pages.length >= 1);

  const templatesPage = page.pages.find((item) => item.id === 'templates');
  assert.ok(templatesPage);
  assert.equal(templatesPage.routePath, 'templates');
  assert.equal(templatesPage.permission, 'wattanam.document-designer.view');

  const dataSourcePermissions = (templatesPage.dataSources || []).map((item) => item.permission);
  assert.ok(dataSourcePermissions.includes('wattanam.document-designer.view'));
  assert.ok(dataSourcePermissions.includes('wattanam.document-designer.edit'));

  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('wattanam.document-designer.view'));
  assert.ok(manifest.permissions.includes('wattanam.document-designer.edit'));
  assert.equal(manifest.navigation[0].href, '/plugins/wattanam.document-designer/templates');
});

test('namespaced migration is one statement with an active-by-type uniqueness constraint', () => {
  const manifest = readJson('plugins/wattanam.document-designer/plugin.json');
  const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', manifest.migrations[0].path.replace(/^/, 'plugins/wattanam.document-designer/')), 'utf8');
  assert.equal((sql.match(/;/g) || []).length, 1);
  assert.match(sql, /CREATE TABLE "plugin_wattanam_document_designer_template"/);
  assert.match(sql, /"activeDocumentType" TEXT GENERATED ALWAYS AS[\s\S]*STORED UNIQUE/);
});

test('re-activation preserves existing template data across simulated disable/remove/reinstall', async () => {
  const rows = [];
  const query = async (sql, params = []) => {
    if (sql.startsWith('SELECT * FROM') && sql.includes('"id" = $1')) return rows.find((row) => row.id === params[0]) ? [rows.find((row) => row.id === params[0])] : [];
    if (sql.includes('FROM plugin_wattanam_document_designer_template') && sql.includes('WHERE "isActive" = FALSE')) return [...rows];
    return [];
  };
  const execute = async (sql, params = []) => {
    if (sql.startsWith('INSERT INTO')) rows.push({ id: params[0], name: params[1], documentType: params[2], design: JSON.parse(params[3]), isActive: false });
    return { count: 1 };
  };

  const first = await activate({ database: { query, execute } });
  await first.byKey.get('POST:templates').handler({ body: { name: 'Survives Reinstall', documentType: 'student', design: { blocks: [1] } } });
  reference.deactivate(first.context);

  // Simulate core remove/reinstall by creating a fresh runtime context while keeping DB rows.
  const second = await activate({ database: { query, execute } });
  const listed = await second.byKey.get('GET:templates').handler();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, 'Survives Reinstall');
});

test('print/export flow is not yet configured as routes or declarative page actions in this wave', async () => {
  const manifest = readJson('plugins/wattanam.document-designer/plugin.json');
  const page = readJson('plugins/wattanam.document-designer/frontend/page.json');
  const { routes } = await activate();

  // Permissions are declared ahead of later wave implementation, but no executable print/export
  // route or declarative action exists yet in this package revision.
  assert.ok(manifest.permissions.includes('wattanam.document-designer.generate'));
  assert.ok(manifest.permissions.includes('wattanam.document-designer.print'));

  const routeKeys = routes.map((route) => `${route.method}:${route.path}`);
  assert.equal(routeKeys.some((key) => /print|export|generate/.test(key)), false);

  const serializedPages = JSON.stringify(page.pages || []);
  assert.equal(/print|export|generate/i.test(serializedPages), false);
});
