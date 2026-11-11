'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { dependencyOrder, loadCatalog, namespaceOf } = require('./check-plugin-migrations-postgres');

const plugin = (id, dependencies = {}) => ({ dir: id, manifest: { id, dependencies } });

test('orders dependencies before dependents', () => {
  const order = dependencyOrder([plugin('c', { b: '^1' }), plugin('b', { a: '^1' }), plugin('a')]).map((p) => p.manifest.id);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('refuses cycles and missing dependencies', () => {
  assert.throws(() => dependencyOrder([plugin('a', { b: '^1' }), plugin('b', { a: '^1' })]), /dependency cycle: a -> b -> a/);
  assert.throws(() => dependencyOrder([plugin('a', { ghost: '^1' })]), /depends on ghost, which is not in the catalog/);
});

test('the official catalog has a valid dependency order and namespaced ids', () => {
  const catalog = loadCatalog(path.resolve(__dirname, '..', 'plugins'));
  assert.ok(catalog.length >= 14);
  const order = dependencyOrder(catalog).map((p) => p.manifest.id);
  assert.ok(order.indexOf('wattanam.academic-management') < order.indexOf('wattanam.attendance-manager'));
  assert.equal(namespaceOf('wattanam.academic-management'), 'plugin_wattanam_academic_management_');
});
