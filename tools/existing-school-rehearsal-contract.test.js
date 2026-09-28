'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('CI rehearses a restored existing school before accepting migration changes', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-upgrade-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_school/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_school/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: document-designer-only/);
  assert.match(workflow, /document-designer-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-document-designer-report\.json/);
  assert.match(workflow, /if-no-files-found: error/);
});

test('the rehearsal covers real backup, isolated restore, zero-write dry-run, adoption and rollback', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'document-designer-restored-backup-certification.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /--confirm-target', 'EMPTY'/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /sourceSha256, adopted\.targetSha256/);
  assert.match(source, /rolledBack: true/);
  assert.match(source, /legacyPreserved: true/);
  assert.match(source, /pluginDataPreserved: true/);
  assert.match(source, /data:image\/png;base64/);
  assert.match(source, /preflight\.assets\.uniqueCount, 1/);
  assert.match(source, /preflight\.assets\.referenceCount, 2/);
  assert.match(source, /after\.assets, preflight\.assets/);
  assert.match(source, /convertAssets/);
  assert.match(source, /converted\.uniqueAssets, 1/);
  assert.match(source, /convertedToScopedStorage: converted\.uniqueAssets/);
  assert.match(source, /legacyAssets: \{ unique:/);
  assert.match(source, /pluginRuntime\.activate/);
  assert.match(source, /templates\/:id\/generate/);
  assert.match(source, /renderedOutputVerified: true/);
  assert.match(source, /adopted legacy geometry\/style changed/);
});

test('CI rehearses the Academic Management foundation against a separate restored database', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-academic-foundation-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_academic/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_academic/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: academic-management-foundation-only/);
  assert.match(workflow, /academic-management-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-academic-foundation-report\.json/);
});

test('Academic foundation rehearsal proves representative copy, parity, rollback and preservation', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-management-restored-backup-certification.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /representative legacy data is absent/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /adopted\.sha256, adopted\.targetSha256/);
  assert.match(source, /rollbackFoundation/);
  assert.match(source, /legacyPreserved: true/);
  assert.match(source, /pluginDataPreserved: true/);
});

test('CI rehearses Academic student profiles with representative restored-school data', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-academic-student-profiles-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_profiles/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_profiles/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: academic-student-profiles-only/);
  assert.match(workflow, /academic-student-profiles-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-academic-student-profiles-report\.json/);
});

test('student-profile rehearsal covers PII-bearing legacy rows, parity and rollback preservation', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-student-profiles-restored-backup-certification.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /representative legacy student profiles are absent/);
  assert.match(source, /dateOfBirth: new Date/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /adopted\.sha256, adopted\.targetSha256/);
  assert.match(source, /rolledBack: true/);
  assert.match(source, /legacyPreserved: true/);
  assert.match(source, /pluginDataPreserved: true/);
});

test('CI rehearses Academic enrollment using isolated source and restored databases', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-academic-enrollment-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_enrollment/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_enrollment/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: academic-enrollment-only/);
  assert.match(workflow, /academic-enrollment-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-academic-enrollment-report\.json/);
});

test('enrollment rehearsal proves relationship parity and rollback preservation', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-enrollment-restored-backup-certification.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /representative legacy enrollments are absent/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /legacy Student\.classId changed/);
  assert.match(source, /rolledBack: true/);
  assert.match(source, /legacyPreserved: true/);
  assert.match(source, /pluginDataPreserved: true/);
});

test('CI rehearses Academic classes using isolated restored-school state', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-academic-classes-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_classes/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_classes/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: academic-classes-only/);
  assert.match(workflow, /academic-classes-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-academic-classes-report\.json/);
});

test('classes rehearsal covers ownership, schedule, pricing, parity and rollback', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-classes-restored-backup-certification.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /representative legacy classes are absent/);
  assert.match(source, /teacherId: users\[0\]\.id/);
  assert.match(source, /classAdminId: users\[1\]\.id/);
  assert.match(source, /price: 25\.5/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /rolledBack: true/);
  assert.match(source, /legacyPreserved: true/);
  assert.match(source, /pluginDataPreserved: true/);
});

test('CI rehearses canonical Academic subjects using isolated restored-school state', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-academic-subjects-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_subjects/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_subjects/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: academic-subjects-only/);
  assert.match(workflow, /academic-subjects-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-academic-subjects-report\.json/);
});

test('subjects rehearsal proves deterministic deduplication and non-destructive rollback', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-subjects-restored-backup-certification.js'), 'utf8');
  const rollback = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-subjects-rollback-drill.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /case\/space subject deduplication failed/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /pluginDataPreserved: true/);
  assert.match(rollback, /rollbackRouting/);
  assert.doesNotMatch(rollback, /DELETE FROM/);
});

test('CI rehearses Academic admissions using isolated restored-school state', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-academic-admissions-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_admissions/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_admissions/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: academic-admissions-only/);
  assert.match(workflow, /academic-admissions-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-academic-admissions-report\.json/);
});

test('admissions rehearsal covers all datasets and preserves them through rollback', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-admissions-restored-backup-certification.js'), 'utf8');
  const rollback = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-admissions-rollback-drill.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /representative legacy admissions are absent/);
  assert.match(source, /representative admissions custom field is absent/);
  assert.match(source, /representative admissions settings are absent/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /pluginDataPreserved: true/);
  assert.match(rollback, /rollbackRouting/);
  assert.doesNotMatch(rollback, /DELETE FROM/);
});

test('CI rehearses Attendance Study Years using isolated restored-school state', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr-validation.yml'), 'utf8');
  assert.match(workflow, /existing-school-attendance-study-years-rehearsal:/);
  assert.match(workflow, /SOURCE_DATABASE_URL: .*source_study_years/);
  assert.match(workflow, /REHEARSAL_DATABASE_URL: .*restored_study_years/);
  assert.match(workflow, /EXISTING_SCHOOL_REHEARSAL_ALLOW: attendance-study-years-only/);
  assert.match(workflow, /academic-study-years-restored-backup-certification\.js --out/);
  assert.match(workflow, /existing-school-attendance-study-years-report\.json/);
});

test('Study Year rehearsal proves current-year parity and non-destructive rollback', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-study-years-restored-backup-certification.js'), 'utf8');
  const rollback = fs.readFileSync(path.join(root, 'backend', 'scripts', 'academic-study-years-rollback-drill.js'), 'utf8');
  assert.match(source, /scripts\/backup-database\.js/);
  assert.match(source, /scripts\/restore-database\.js/);
  assert.match(source, /representative current Study Year is absent/);
  assert.match(source, /dryRunZeroWrite: true/);
  assert.match(source, /pluginDataPreserved: true/);
  assert.match(source, /migrate\(restored\)/);
  assert.match(rollback, /rollbackRouting/);
  assert.doesNotMatch(rollback, /DELETE FROM/);
});
