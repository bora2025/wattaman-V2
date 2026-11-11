#!/usr/bin/env node
'use strict';

// Applies every official plugin's migrations, in dependency order and manifest order, to an EMPTY
// PostgreSQL database (one transaction per migration, like the school host), then checks that every
// table lives in its plugin's namespace, has a primary key, and every foreign key has a covering
// index. CI runs it against a throwaway
// service container; it refuses a database that already has tables.
//
// Usage: node tools/check-plugin-migrations-postgres.js [plugins-dir]
// Env:   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (standard libpq variables; needs `psql`).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const namespaceOf = (pluginId) => `plugin_${pluginId.replace(/[^a-z0-9]/g, '_')}_`;

function loadCatalog(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'plugin.json')))
    .map((entry) => ({ dir: path.join(root, entry.name), manifest: JSON.parse(fs.readFileSync(path.join(root, entry.name, 'plugin.json'), 'utf8')) }))
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/** Dependencies first; refuses cycles and dependencies missing from the catalog. */
function dependencyOrder(plugins) {
  const byId = new Map(plugins.map((plugin) => [plugin.manifest.id, plugin]));
  const order = [];
  const state = new Map();
  const visit = (plugin, trail) => {
    const id = plugin.manifest.id;
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error(`dependency cycle: ${[...trail, id].join(' -> ')}`);
    state.set(id, 'visiting');
    for (const dependency of Object.keys(plugin.manifest.dependencies || {})) {
      if (!byId.has(dependency)) throw new Error(`${id} depends on ${dependency}, which is not in the catalog`);
      visit(byId.get(dependency), [...trail, id]);
    }
    state.set(id, 'done');
    order.push(plugin);
  };
  for (const plugin of plugins) visit(plugin, []);
  return order;
}

function psql(sql) {
  const result = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
  if (result.error) throw new Error(`psql is not available: ${result.error.message}`);
  return result;
}

function query(sql) {
  const result = psql(sql);
  if (result.status !== 0) throw new Error((result.stderr || '').trim());
  return result.stdout.trim();
}

function main(root = path.resolve(__dirname, '..', 'plugins')) {
  const existing = Number(query("SELECT count(*) FROM pg_tables WHERE schemaname = 'public';"));
  if (existing !== 0) throw new Error(`refusing to run against a database that already has ${existing} table(s); use an empty throwaway database`);

  const failures = [];
  let applied = 0;
  for (const { dir, manifest } of dependencyOrder(loadCatalog(root))) {
    const migrations = manifest.migrations || [];
    let done = 0;
    for (const migration of migrations) {
      const sql = fs.readFileSync(path.join(dir, migration.path), 'utf8');
      const result = psql(`BEGIN;\n${sql}\n;\nCOMMIT;\n`);
      if (result.status !== 0) {
        failures.push(`${manifest.id}@${manifest.version} ${migration.id}: ${(result.stderr || '').trim().split('\n').slice(-2).join(' | ')}`);
        break;
      }
      done += 1;
    }
    applied += done;
    console.log(`${done === migrations.length ? 'ok  ' : 'FAIL'} ${manifest.id}@${manifest.version}: ${done}/${migrations.length} migrations`);
  }

  const plugins = loadCatalog(root).map((plugin) => namespaceOf(plugin.manifest.id));
  const tables = query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;").split('\n').filter(Boolean);
  const outside = tables.filter((table) => !plugins.some((namespace) => table.startsWith(namespace)));
  if (outside.length) failures.push(`tables outside every plugin namespace: ${outside.join(', ')}`);
  const withoutPrimaryKey = query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_constraint p WHERE p.conrelid = c.oid AND p.contype = 'p') ORDER BY 1;`).split('\n').filter(Boolean);
  if (withoutPrimaryKey.length) failures.push(`tables without a primary key: ${withoutPrimaryKey.join(', ')}`);
  // A foreign key without an index whose leading columns are the key makes every parent delete and
  // every join on it scan the child table; add `CREATE INDEX IF NOT EXISTS ... (<fk columns>)`.
  const unindexedForeignKeys = query(`SELECT c.conrelid::regclass::text || '(' || (
      SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) || ')'
    FROM pg_constraint c WHERE c.contype = 'f' AND NOT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
        AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
        AND c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1]) ORDER BY 1;`).split('\n').filter(Boolean);
  if (unindexedForeignKeys.length) failures.push(`foreign keys without a covering index: ${unindexedForeignKeys.join(', ')}`);

  console.log(`\napplied ${applied} migrations; ${tables.length} tables`);
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try { main(process.argv[2] ? path.resolve(process.argv[2]) : undefined); } catch (error) { console.error(`FAIL: ${error.message}`); process.exit(1); }
}

module.exports = { dependencyOrder, loadCatalog, namespaceOf };
