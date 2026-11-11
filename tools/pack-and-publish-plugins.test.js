'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { packagesToPublish } = require('./pack-and-publish-plugins');

const dir = path.resolve('tmp', 'packages');
const file = (name) => path.join(dir, name);
const available = [file('wattanam.academic-management-0.3.4.wtp'), file('wattanam.academic-management-0.3.5.wtp'), file('wattanam.attendance-manager-0.2.1.wtp')];

test('a packing run publishes only the packages it just built, never leftovers', () => {
  const packed = [file('wattanam.academic-management-0.3.5.wtp')];
  assert.deepEqual(packagesToPublish({ publishOnly: false, packed, available }), packed);
});

test('a packing run that built nothing publishes nothing', () => {
  assert.deepEqual(packagesToPublish({ publishOnly: false, packed: [], available }), []);
});

test('PUBLISH_ONLY publishes the whole folder of pre-built packages on purpose', () => {
  assert.deepEqual(packagesToPublish({ publishOnly: true, packed: [], available }), available);
});
