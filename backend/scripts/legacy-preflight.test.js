'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BASELINE, buildReport, classify, fingerprint } = require('./legacy-preflight');

test('empty databases can run normal migrations', () => {
  assert.deepEqual(classify({ tables: [], migrations: [] }), {
    state: 'empty', nextAction: 'migrate_deploy', safeToMutate: true,
  });
});

test('managed databases can continue normal migrations', () => {
  assert.equal(classify({ tables: ['User', '_prisma_migrations'], migrations: [BASELINE] }).state, 'managed');
});

test('complete legacy anchors require comparison and backup before adoption', () => {
  assert.deepEqual(classify({ tables: ['User', 'Class', 'Student'], migrations: [] }), {
    state: 'legacy_unadopted', nextAction: 'schema_diff_backup_restore_then_adopt', safeToMutate: false,
  });
});

test('partial and contradictory schemas stop automatically', () => {
  const partial = classify({ tables: ['User', 'Student'], migrations: [] });
  assert.equal(partial.state, 'unsupported_partial');
  assert.equal(partial.safeToMutate, false);
  assert.deepEqual(partial.missingLegacyAnchors, ['Class']);
});

test('reports contain stable metadata fingerprints but no customer rows', () => {
  const snapshot = {
    databaseVersion: '16.4', databaseBytes: 1234,
    tables: ['Student', 'Class', 'User'], migrations: [],
    columns: [{ table: 'User', column: 'id', type: 'text', nullable: 'NO', default: '' }],
    constraints: ['User:User_pkey:PRIMARY KEY'],
  };
  const report = buildReport(snapshot);
  assert.equal(report.containsCustomerRows, false);
  assert.equal(report.schemaFingerprint, fingerprint(snapshot));
  assert.equal(report.tableCount, 3);
  assert.equal(JSON.stringify(report).includes('password'), false);
});
