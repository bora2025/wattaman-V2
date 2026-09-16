'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { inspect } = require('./document-designer-adoption-preflight');

function fixture(rows, exists = true) {
  const calls = [];
  const adapter = {
    readSourceChunk: async ({ after, limit }) => {
      calls.push(['read', after, limit]);
      return rows.filter((row) => !after || row.id > after).slice(0, limit);
    },
    targetExists: async () => { calls.push(['target']); return exists; },
  };
  return { adapter, calls };
}

const row = (id, name = 'Card', cardType = 'student') => ({
  id, name, cardType, design: { cardType, texts: [] },
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'),
});

test('chunks the source deterministically and reports only metadata, with no mutation calls', async () => {
  const { adapter, calls } = fixture([row('a'), row('b', '__active__'), row('c', 'Staff', 'staff')]);
  const report = await inspect(adapter, { batchSize: 2 });
  const repeat = await inspect(fixture([row('a'), row('b', '__active__'), row('c', 'Staff', 'staff')]).adapter, { batchSize: 1 });

  assert.equal(report.ready, true);
  assert.equal(report.readOnly, true);
  assert.equal(report.source.rowCount, 3);
  assert.deepEqual(report.source.activeByType, { student: 'b' });
  assert.equal(report.source.sha256, repeat.source.sha256);
  assert.deepEqual(calls.map((call) => call[0]), ['read', 'read', 'read', 'target']);
  assert.equal(JSON.stringify(report).includes('texts'), false);
});

test('fails closed for absent target, duplicate active, unsupported type and mismatched design', async () => {
  const rows = [row('a', '__active__'), row('b', '__active__'), row('c', 'Wrong', 'unknown')];
  rows[2].design.cardType = 'student';
  const report = await inspect(fixture(rows, false).adapter);
  assert.equal(report.ready, false);
  assert.equal(report.blockers.length, 4);
  assert.match(report.blockers.join(' '), /duplicate active templates/);
  assert.match(report.blockers.join(' '), /target table .* is absent/);
});

test('rejects unordered source data and invalid batch sizes before any adoption', async () => {
  await assert.rejects(inspect(fixture([row('b'), row('a')]).adapter), /strictly increasing IDs/);
  await assert.rejects(inspect(fixture([]).adapter, { batchSize: 0 }), /batchSize/);
});
