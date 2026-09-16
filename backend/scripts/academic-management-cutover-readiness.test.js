'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { inspect, TARGET_TABLES } = require('./academic-management-adoption-preflight');
const { journalPaths } = require('./academic-management-adopt');
const { inspect: inspectStudyYears, TARGET_TABLE: STUDY_YEAR_TARGET_TABLE } = require('./academic-study-years-adoption-preflight');
const { journalPath: studyYearJournalPath } = require('./academic-study-years-adopt');
const { inspect: inspectClasses, TARGET_TABLE: CLASS_TARGET_TABLE } = require('./academic-classes-adoption-preflight');
const { journalPath: classJournalPath } = require('./academic-classes-adopt');
const { TARGET_TABLES: ADMISSIONS_TARGET_TABLES, inspect: inspectAdmissions } = require('./academic-admissions-adoption-preflight');
const { journalPath: admissionsJournalPath } = require('./academic-admissions-adopt');
const { check } = require('./academic-management-cutover-readiness');

const backupName = 'wattanam-20260915T000000Z.dump';
const departments = [{ id: 'd1', name: 'Science', nameKh: null, description: null }];
const memberships = [{ userId: 'u1', departmentId: 'd1' }];
const studyYears = [{ id: 'y1', year: 2026, label: '2026-2027', startDate: null, endDate: null, isCurrent: true, schoolName: 'Wattanam', logoUrl: null }];
const classes = [{ id: 'c1', name: 'Class A', subject: 'Math', teacherId: 't1', classAdminId: 'a1', studyYearId: 'y1', schedule: null, registrationStatus: 'AVAILABLE', thumbnail: null, description: null, price: null, showPrice: false, createdAt: null, updatedAt: null }];
const registrations = [{ id: 'r1', classId: 'c1', nameKh: null, nameEn: 'Student One', email: 's1@school.test', phone: null, passwordHash: 'hash1', generatedPassword: null, photo: null, sex: null, dateOfBirth: null, address: null, generation: null, customFieldValues: null, status: 'PENDING', rejectReason: null, studentId: null, createdAt: '2026-01-01T00:00:00.000Z', resolvedAt: null, resolvedBy: null }];
const settings = { id: 'singleton', khmerNameMode: 'REQUIRED', phoneMode: 'REQUIRED', emailMode: 'OPTIONAL', photoMode: 'OPTIONAL', passwordMode: 'REQUIRED', sexMode: 'HIDDEN', dateOfBirthMode: 'HIDDEN', addressMode: 'HIDDEN', generationMode: 'HIDDEN', updatedAt: '2026-01-01T00:00:00.000Z' };
const fields = [];

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'academic-cutover-check-'));
  const archive = path.join(directory, backupName);
  fs.writeFileSync(archive, 'test pg_dump fixture');
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(archive.replace('.dump', '.manifest.json'), JSON.stringify({
    format: 'pg_dump-custom-v1', file: backupName, installationSlug: 'bora-school',
    sizeBytes: fs.statSync(archive).size, sha256: checksum,
  }));
  const state = {
    targetDepartments: [...departments], targetMemberships: [...memberships],
    targetStudyYears: [...studyYears], targetClasses: [...classes],
    targetRegistrations: [...registrations], targetSettings: { ...settings }, targetFields: [...fields],
    plugin: { status: 'active', version: '0.1.0' },
    targetsExist: true, studyYearTargetExists: true, classTargetExists: true, admissionsTargetsExist: true,
    writes: 0,
  };
  const chunk = (rows, key, after, limit) => rows.filter((row) => !after || row[key] > after).slice(0, limit);
  const adapter = {
    readDepartmentChunk: async ({ after, limit }) => chunk(departments, 'id', after, limit),
    readMembershipChunk: async ({ after, limit }) => chunk(memberships, 'userId', after, limit),
    readStudyYearChunk: async ({ after, limit }) => studyYears.filter((row) => after === null || row.year > after).slice(0, limit),
    readClassChunk: async ({ after, limit }) => classes.filter((row) => !after || row.id > after).slice(0, limit),
    readRegistrationChunk: async ({ after, limit }) => registrations.filter((row) => !after || row.id > after).slice(0, limit),
    readSettingsSingleton: async () => settings,
    readFieldChunk: async ({ after, limit }) => fields.filter((row) => !after || row.id > after).slice(0, limit),
    readTargetDepartmentChunk: async ({ after, limit }) => chunk(state.targetDepartments, 'id', after, limit),
    readTargetMembershipChunk: async ({ after, limit }) => chunk(state.targetMemberships, 'userId', after, limit),
    readTargetStudyYearChunk: async ({ after, limit }) => state.targetStudyYears.filter((row) => row.year > (after ?? Number.MIN_SAFE_INTEGER)).slice(0, limit),
    readTargetClassChunk: async ({ after, limit }) => state.targetClasses.filter((row) => !after || row.id > after).slice(0, limit),
    readTargetRegistrationChunk: async ({ after, limit }) => chunk(state.targetRegistrations, 'id', after, limit),
    readTargetSettingsSingleton: async () => state.targetSettings,
    readTargetFieldChunk: async ({ after, limit }) => chunk(state.targetFields, 'id', after, limit),
    targetState: async (tables) => tables.map((table) => ({ table, exists: state.targetsExist, rowCount: table === TARGET_TABLES[0] ? state.targetDepartments.length : state.targetMemberships.length })),
    studyYearTargetState: async (table) => ({ table, exists: state.studyYearTargetExists, rowCount: state.targetStudyYears.length }),
    classTargetState: async (table) => ({ table, exists: state.classTargetExists, rowCount: state.targetClasses.length }),
    admissionsTargetState: async (table) => {
      const rowCount =
        table === ADMISSIONS_TARGET_TABLES[0] ? state.targetRegistrations.length :
        table === ADMISSIONS_TARGET_TABLES[1] ? (state.targetSettings ? 1 : 0) :
        state.targetFields.length;
      return { table, exists: state.admissionsTargetsExist, rowCount };
    },
    pluginState: async () => state.plugin,
  };
  const source = await inspect(adapter);
  const sourceStudyYears = await inspectStudyYears({ readStudyYearChunk: adapter.readStudyYearChunk, targetState: adapter.studyYearTargetState });
  const sourceClasses = await inspectClasses({ readClassChunk: adapter.readClassChunk, targetState: adapter.classTargetState });
  const sourceAdmissions = await inspectAdmissions({
    readRegistrationChunk: adapter.readRegistrationChunk,
    readSettingsSingleton: adapter.readSettingsSingleton,
    readFieldChunk: adapter.readFieldChunk,
    targetState: adapter.admissionsTargetState,
  });
  const identity = `academic:bora-school:${source.source.sha256}:${checksum}`;
  const studyYearIdentity = `academic-study-years:bora-school:${sourceStudyYears.source.sha256}:${checksum}`;
  const classIdentity = `academic-classes:bora-school:${sourceClasses.source.sha256}:${checksum}`;
  const admissionsIdentity = `academic-admissions:bora-school:${sourceAdmissions.source.sha256}:${checksum}`;
  const files = journalPaths(directory, 'bora-school');
  for (const [phase, file] of [['departments', files.departments], ['memberships', files.memberships]]) {
    fs.writeFileSync(file, JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: `${identity}:${phase}`, stage: 'reconciled', backupSha256: checksum }));
  }
  fs.writeFileSync(studyYearJournalPath(directory, 'bora-school'), JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: studyYearIdentity, stage: 'reconciled', backupSha256: checksum }));
  fs.writeFileSync(classJournalPath(directory, 'bora-school'), JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: classIdentity, stage: 'reconciled', backupSha256: checksum }));
  fs.writeFileSync(admissionsJournalPath(directory, 'bora-school'), JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: admissionsIdentity, stage: 'reconciled', backupSha256: checksum }));
  return { directory, adapter, state, files, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('reports ready only for exact source/target parity, reconciled journals, backup and active plugin', async () => {
  const sample = await fixture();
  try {
    const report = await check({ adapter: sample.adapter, directory: sample.directory, backupName, slug: 'bora-school' });
    assert.equal(report.ready, true);
    assert.equal(report.readOnly, true);
    assert.equal(report.source.departments.sha256, report.target.departments.sha256);
    assert.equal(report.source.studyYears.sha256, report.target.studyYears.sha256);
    assert.equal(report.source.classes.sha256, report.target.classes.sha256);
    assert.equal(report.source.admissions.sha256, report.target.admissions.sha256);
    assert.equal(sample.state.writes, 0);
  } finally { sample.close(); }
});

test('fails closed for changed target, incomplete journal, inactive plugin and maintenance lock', async () => {
  const sample = await fixture();
  try {
    sample.state.targetMemberships = [{ userId: 'u1', departmentId: 'changed' }];
    sample.state.targetStudyYears = [{ ...studyYears[0], year: 2027 }];
    sample.state.targetClasses = [{ ...classes[0], name: 'Changed' }];
    sample.state.targetRegistrations = [{ ...registrations[0], nameEn: 'Changed' }];
    sample.state.plugin = { status: 'inactive', version: '0.1.0' };
    fs.writeFileSync(sample.files.memberships, JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: 'wrong', stage: 'reconciled' }));
    fs.writeFileSync(studyYearJournalPath(sample.directory, 'bora-school'), JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: 'wrong', stage: 'reconciled' }));
    fs.writeFileSync(classJournalPath(sample.directory, 'bora-school'), JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: 'wrong', stage: 'reconciled' }));
    fs.writeFileSync(admissionsJournalPath(sample.directory, 'bora-school'), JSON.stringify({ format: 'wattanam-plugin-adoption-v1', identity: 'wrong', stage: 'reconciled' }));
    fs.writeFileSync(sample.files.maintenance, 'locked');
    const report = await check({ adapter: sample.adapter, directory: sample.directory, backupName, slug: 'bora-school' });
    assert.equal(report.ready, false);
    assert.match(report.blockers.join(' '), /fingerprints\/counts differ/);
    assert.match(report.blockers.join(' '), /study-year source and target fingerprints\/counts differ/);
    assert.match(report.blockers.join(' '), /class source and target fingerprints\/counts differ/);
    assert.match(report.blockers.join(' '), /admissions source and target fingerprints\/counts differ/);
    assert.match(report.blockers.join(' '), /journal identity is invalid/);
    assert.match(report.blockers.join(' '), /plugin is not active/);
    assert.match(report.blockers.join(' '), /maintenance lock/);
  } finally { sample.close(); }
});

test('missing target tables block readiness without querying the absent target', async () => {
  const sample = await fixture();
  try {
    sample.state.targetsExist = false;
    sample.state.studyYearTargetExists = false;
    sample.state.classTargetExists = false;
    sample.state.admissionsTargetsExist = false;
    sample.adapter.readTargetDepartmentChunk = async () => { throw new Error('must not query absent target'); };
    sample.adapter.readTargetStudyYearChunk = async () => { throw new Error('must not query absent target'); };
    sample.adapter.readTargetClassChunk = async () => { throw new Error('must not query absent target'); };
    sample.adapter.readTargetRegistrationChunk = async () => { throw new Error('must not query absent target'); };
    sample.adapter.readTargetSettingsSingleton = async () => { throw new Error('must not query absent target'); };
    sample.adapter.readTargetFieldChunk = async () => { throw new Error('must not query absent target'); };
    const report = await check({ adapter: sample.adapter, directory: sample.directory, backupName, slug: 'bora-school' });
    assert.equal(report.ready, false);
    assert.equal(report.target.departments, null);
    assert.equal(report.target.studyYears, null);
    assert.equal(report.target.classes, null);
    assert.equal(report.target.admissions, null);
    assert.match(report.blockers.join(' '), /is absent/);
  } finally { sample.close(); }
});
