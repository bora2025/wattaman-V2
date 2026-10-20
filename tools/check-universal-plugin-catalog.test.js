'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCatalogContracts } = require('./check-universal-plugin-catalog');

const manifest = (id, overrides = {}) => ({
  id, dependencies: {}, optionalDependencies: {},
  contracts: { events: { publishes: {}, subscribes: {} }, readModels: { publishes: {}, reads: {} } },
  ...overrides,
});

test('accepts compatible versioned producer and consumer contracts', () => {
  const producer = manifest('acme.source', { contracts: { events: { publishes: {}, subscribes: {} }, readModels: { publishes: { summary: [1, 2] }, reads: {} } } });
  const consumer = manifest('acme.report', { optionalDependencies: { 'acme.source': '>=1' }, contracts: { events: { publishes: {}, subscribes: {} }, readModels: { publishes: {}, reads: { 'acme.source.summary': [2] } } } });
  assert.doesNotThrow(() => verifyCatalogContracts([producer, consumer]));
});

test('rejects undeclared dependencies and incompatible read-model versions', () => {
  const producer = manifest('acme.source', { contracts: { events: { publishes: {}, subscribes: {} }, readModels: { publishes: { summary: [1] }, reads: {} } } });
  const consumer = manifest('acme.report', { contracts: { events: { publishes: {}, subscribes: {} }, readModels: { publishes: {}, reads: { 'acme.source.summary': [2] } } } });
  assert.throws(() => verifyCatalogContracts([producer, consumer]), /without declaring/);
  consumer.optionalDependencies['acme.source'] = '>=1';
  assert.throws(() => verifyCatalogContracts([producer, consumer]), /no compatible version/);
});
