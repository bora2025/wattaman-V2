'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { inspect, TARGET_TABLES } = require('./academic-management-adoption-preflight');
const { journalPaths } = require('./academic-management-adopt');
const { check } = require('./academic-management-cutover-readiness');

const backupName = 'wattanam-20260915T000000Z.dump';
const departments = [{ id: 'd1', name: 'Science', nameKh: null, description: null }];
const memberships = [{ userId: 'u1', departmentId: 'd1' }];

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'academic-cutover-check-'));
  const archive = path.join(directory, backupName);
  fs.writeFileSync(archive, 'test pg_dump fixture');
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(archive.replace('.dump', '.manifest.json'), JSON.stringify({
    format: 'pg_dump-custom-v1', file: backupName, installationSlug: 'bora-school',
    sizeBytes: fs.statSync(archive).size, sha256: checksum,
  }));
  const state = { targetDepartments: [...departments], targetMemberships: [...memberships], plugin: { status: 'active', version: '0.1.0' }, targetsExist: true, writes: 0 };
  const chunk = (rows, key, after, limit) => rows.filter((row) => !after || row[key] > after).slice(0, limit);
  const adapter = {
    readDepartmentChunk: async ({ after, limit }) => chunk(departments, 'id', after, limit),
    readMembershipChunk: async ({ after, limit }) => chunk(memberships, 'userId', after, limit),
    readTargetDepartmentChunk: async ({ after, limit }) => chunk(state.targetDepartments, 'id', after, limit),
    readTargetMembershipChunk: async ({ after, limit }) => chunk(state.targetMemberships, 'userId', after, limit),
    targetState: async (tables) => tables.map((table) => ({ table, exists: state.targetsExist, rowCount: table === TARGET_TABLES[0] ? state.targetDepartments.length : state.targetMemberships.length })),
    pluginState: async () => state.plugin,
  };
  const source = await inspect(adapter);
  const identity = `academic:bora-school:${source.source.sha256}:${checksum}`;
  const files = journalPaths(directory, 'bora-school');
  for (const [phase, file] of [['departments', files.departments], ['memberships', files.memberships]]) {
    fs.writeFileSync(file, JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: `${identity}:${phase}`, stage: 'reconciled', backupSha256: checksum }));
  }
  return { directory, adapter, state, files, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('reports ready only for exact source/target parity, reconciled journals, backup and active plugin', async () => {
  const sample = await fixture();
  try {
    const report = await check({ adapter: sample.adapter, directory: sample.directory, backupName, slug: 'bora-school' });
    assert.equal(report.ready, true);
    assert.equal(report.readOnly, true);
    assert.equal(report.source.sha256, report.target.sha256);
    assert.equal(sample.state.writes, 0);
  } finally { sample.close(); }
});

test('fails closed for changed target, incomplete journal, inactive plugin and maintenance lock', async () => {
  const sample = await fixture();
  try {
    sample.state.targetMemberships = [{ userId: 'u1', departmentId: 'changed' }];
    sample.state.plugin = { status: 'inactive', version: '0.1.0' };
    fs.writeFileSync(sample.files.memberships, JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: 'wrong', stage: 'reconciled' }));
    fs.writeFileSync(sample.files.maintenance, 'locked');
    const report = await check({ adapter: sample.adapter, directory: sample.directory, backupName, slug: 'bora-school' });
    assert.equal(report.ready, false);
    assert.match(report.blockers.join(' '), /fingerprints\/counts differ/);
    assert.match(report.blockers.join(' '), /journal identity is invalid/);
    assert.match(report.blockers.join(' '), /plugin is not active/);
    assert.match(report.blockers.join(' '), /maintenance lock/);
  } finally { sample.close(); }
});

test('missing target tables block readiness without querying the absent target', async () => {
  const sample = await fixture();
  try {
    sample.state.targetsExist = false;
    sample.adapter.readTargetDepartmentChunk = async () => { throw new Error('must not query absent target'); };
    const report = await check({ adapter: sample.adapter, directory: sample.directory, backupName, slug: 'bora-school' });
    assert.equal(report.ready, false);
    assert.equal(report.target, null);
    assert.match(report.blockers.join(' '), /is absent/);
  } finally { sample.close(); }
});
