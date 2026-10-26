'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', 'plugins', 'wattanam.academic-management');
const plugin = require(path.join(root, 'backend', 'index.js'));
const { registerAuthoritativeReports } = require(path.join(root, 'backend', 'authoritative-reports.js'));
const { registerSelfAttendance } = require(path.join(root, 'backend', 'self-attendance.js'));

test('Academic Management uses the universal SDK 1.3 UI contract', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'page.json'), 'utf8'));
  const universal = new Set(['heading','text','workflow','status','card','metric','table','form','detail','chart','file','print','document','designer','scanner','filter','actions','id-card-manager','session-manager','profile-manager','class-manager','officer-manager']);
  const components = descriptor.pages.flatMap((page) => page.components || []);
  assert.equal(manifest.sdkVersion, '1.3.0');
  assert.deepEqual(manifest.hostContracts, ['wattanam.academic.directory.v1', 'wattanam.academic.identity.v1']);
  assert.equal(descriptor.portability, 'universal');
  assert.ok(components.every((component) => universal.has(component.type)), 'host-specific component remains in universal descriptor');
  assert.equal(components.filter((component) => component.type === 'actions').length, 0);
  assert.equal(components.filter((component) => component.type === 'table' && component.options?.selectable).length, 0);
  const recordActions = components.reduce((count, component) => count + (component.options?.rowActions?.length || 0), 0)
    + components.filter((component) => component.type === 'officer-manager' && component.options?.deactivateSource).length;
  assert.ok(recordActions >= 10);
});

test('class roster groups single, CSV, and existing-student creation behind one action menu', () => {
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'page.json'), 'utf8'));
  const roster = descriptor.pages.find((page) => page.id === 'class-students');
  const forms = roster.components
    .filter((component) => component.type === 'form' && component.options?.actionMenu === 'student-create')
    .sort((left, right) => left.options.actionMenuOrder - right.options.actionMenuOrder);
  assert.deepEqual(forms.map((form) => form.source), ['createStudent', 'bulkUploadStudents', 'addStudent']);
  assert.ok(forms.every((form) => form.options.actionMenuLabel === 'Add student'));
  assert.ok(roster.components.some((component) => component.type === 'table' && component.options?.rowClickable));
  assert.ok(roster.components.some((component) => component.type === 'print' && component.options?.formats.includes('xlsx')));
});

function tamperSignedToken(token) {
  const [payload, signature] = token.split('.');
  return `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
}

function selfScanHarness(overrides = {}) {
  const routes = new Map();
  const audits = [];
  const records = [];
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const fingerprint = crypto.createHash('sha256').update(publicKeyPem).digest('hex');
  const now = new Date();
  const window = {
    id: 'window-1', classId: 'class-1', session: 1, sessionType: 'CHECK_IN', status: 'OPEN', createdById: 'teacher-1',
    startsAt: new Date(now.getTime() - 300000).toISOString(), endsAt: new Date(now.getTime() + 300000).toISOString(),
    maxOfflineMinutes: 120, locationRequired: false, registeredDeviceRequired: false,
    latitude: 11.5564, longitude: 104.9282, radiusMeters: 50, maxAccuracyMeters: 100,
    ...overrides.window,
  };
  const claims = {
    version: 1, windowId: window.id, classId: window.classId, session: window.session,
    sessionType: window.sessionType, nonce: 'nonce-1', issuedAt: Math.floor((now.getTime() - 60000) / 1000),
    expiresAt: Math.floor((now.getTime() + 300000) / 1000), organizationId: fingerprint.slice(0, 24),
    ...overrides.claims,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const token = `${payload}.${crypto.sign(null, Buffer.from(payload), privateKeyPem).toString('base64url')}`;
  const key = { id: 'primary', algorithm: 'Ed25519', publicKeyPem, privateKeyPem, fingerprint };
  const database = {
    query: async (sql, params = []) => {
      if (sql.includes('_attendance_self_scan') && sql.includes('"clientRequestId"=$1')) return audits.filter((row) => row.clientRequestId === params[0]);
      if (sql.includes('_attendance_self_scan') && sql.includes('COUNT(*)')) return [{ count: 0 }];
      if (sql.includes('_student_profile')) return [{ id: 'student-1', userId: 'user-1', studentNumber: '0001', nameKh: 'Student One' }];
      if (sql.includes('_attendance_signing_key')) return [key];
      if (sql.includes('_attendance_window')) return [window];
      if (sql.includes('_attendance_holiday')) return overrides.holiday ? [{ id: 'holiday-1' }] : [];
      if (sql.includes('_attendance_device')) return overrides.deviceAccepted ? [{ id: 'device-1' }] : [];
      if (sql.includes('_attendance_session')) return [{ session: 1, startTime: '00:00' }];
      if (sql.includes('_study_year')) return [{ id: 'year-1', label: '2026-2027', year: 2026 }];
      if (sql.includes('_attendance_record') && sql.includes('"personType"')) return records.filter((row) => row.personId === params[0] && row.classId === params[1] && Number(row.session) === Number(params[3]));
      if (sql.includes('_attendance_record') && sql.includes('"id"=$1')) return records.filter((row) => row.id === params[0]);
      return [];
    },
    execute: async (sql, params = []) => {
      if (sql.includes('INSERT INTO plugin_wattanam_academic_management_attendance_self_scan')) {
        audits.push({
          id: params[0], clientRequestId: params[1], tokenHash: params[2], tokenVersion: params[3], nonce: params[4],
          attendanceWindowId: params[5], studentProfileId: params[6], directoryUserId: params[7], classId: params[8],
          session: params[9], scannedAt: params[10], syncState: params[11], deviceIdHash: params[12], networkQuality: params[13],
          latitude: params[14], longitude: params[15], accuracyMeters: params[16], locationDecision: params[17], result: params[18],
          rejectionReason: params[19], recordId: params[20], reviewStatus: params[21],
        });
      }
      if (sql.includes('INSERT INTO plugin_wattanam_academic_management_attendance_record')) {
        records.push({ id: params[0], personId: params[1], classId: params[2], studyYearId: params[3], date: params[4], session: params[5], status: params[6], checkInTime: params[7], checkOutTime: params[8] });
      }
      return { count: 1 };
    },
    transaction: async (work) => work({ query: (...args) => database.query(...args), execute: (...args) => database.execute(...args), publish: async () => {} }),
  };
  registerSelfAttendance({
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); } }, database,
    permissions: { register() {} }, navigation: { register() {} },
    realtime: { notifyUser() {} }, events: { publish() {} },
    settings: { get: async (_key, fallback) => fallback },
    directory: {
      getEnrollmentAtDate: async () => overrides.enrollment || { enrolled: true, classId: 'class-1' },
      classesForUser: async () => [], getClassRoster: async () => ({ className: 'A', students: [{ studentId: 'student-1', studentNumber: '0001', name: 'Student One' }] }),
      getClassAttendanceSchedule: async () => ({ attendanceFormat: 'GLOBAL', week: overrides.studyDays || ['SUN','MON','TUE','WED','THU','FRI','SAT'] }),
    },
  });
  return { handler: routes.get('POST student/self-scan').handler, token, claims, audits, records, now };
}

async function activate(directory = { lookupUsers: async () => [], resolveAudience: async () => [] }, databaseOverride = null, accountsOverride = null) {
  const routes = new Map();
  const permissions = [];
  const navigation = [];
  const database = databaseOverride || { query: async () => [], execute: async () => ({ count: 1 }), transaction: async (work) => work({ query: async () => [], execute: async () => ({ count: 1 }), publish() {} }) };
  await plugin.activate({
    logger: { log() {} },
    database,
    directory,
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); return () => {}; } },
    permissions: { register(items) { permissions.push(...items); return () => {}; } },
    navigation: { register(items) { navigation.push(...items); return () => {}; } },
    events: { publish() {}, subscribe() { return () => {}; } },
    settings: { get: async (_key, fallback) => fallback, set: async () => {} },
    notifications: { notifyInApp: async () => {}, sendEmail: async () => ({ sent: true }) },
    readModels: { read: async () => [], publish: async () => {} },
    crypto: { hashBcrypt: async (value) => `hash:${value}` },
    accounts: accountsOverride || { createStaff: async (input) => ({ id: 'staff-user-1', name: input.name, email: input.email, phone: input.phone, role: input.role }), createStudent: async () => ({}), updateStudent: async () => ({}) },
  });
  return { routes, permissions, navigation };
}

test('activated authoritative reports use Academic Management enrollment rosters', async () => {
  const reportDate = new Date().toISOString().slice(0, 10);
  const record = { personId: 'student-1', personType: 'STUDENT', classId: 'class-1', date: reportDate, session: 1, status: 'PRESENT', personNameSnapshot: 'Student One', personNumberSnapshot: '0001' };
  const database = {
    query: async (sql) => {
      if (sql.includes('FROM plugin_wattanam_academic_management_class') && sql.includes('"schedule"')) return [{ id: 'class-1', name: 'A', schedule: JSON.stringify({ week: ['SUN','MON','TUE','WED','THU','FRI','SAT'] }) }];
      if (sql.includes('FROM plugin_wattanam_academic_management_class')) return [{ id: 'class-1', name: 'A' }];
      if (sql.includes('FROM plugin_wattanam_academic_management_enrollment_interval')) return [{ studentId: 'student-1' }];
      if (sql.includes('FROM plugin_wattanam_academic_management_student_profile')) return [{ id: 'student-1', userId: 'user-1', studentNumber: '0001', guardianUserId: null }];
      if (sql.includes('FROM plugin_wattanam_academic_management_attendance_session')) return [{ scope: 'STUDENT', classId: '', session: 1, type: 'CHECK_IN', startTime: '00:00', endTime: '23:59' }];
      if (sql.includes('FROM plugin_wattanam_academic_management_attendance_record')) return [record];
      return [];
    },
    execute: async () => ({ count: 1 }),
    transaction: async (work) => work({ query: async () => [], execute: async () => ({ count: 1 }), publish() {} }),
  };
  const directory = {
    lookupUsers: async () => [{ id: 'user-1', name: 'Student One' }],
    resolveAudience: async () => [],
    getClassRoster: async () => { throw new Error('legacy roster must not be used'); },
  };
  const { routes } = await activate(directory, database);
  const report = await routes.get('GET reports/authoritative').handler({ query: { classId: 'class-1', date: reportDate }, principal: { role: 'ADMIN', userId: 'admin-1' } });
  assert.equal(report.totals.present, 1);
  assert.deepEqual(report.people.map((person) => person.id), ['student-1']);
});

test('Academic Year writes cast browser date strings to PostgreSQL timestamps', async () => {
  const writes = [];
  const database = {
    query: async (sql) => sql.includes('_study_year') ? [{ id: 'year-1', year: 2026 }] : [],
    execute: async (sql, params) => { writes.push({ sql, params }); return { count: 1 }; },
    transaction: async (work) => work({ query: async () => [{ id: 'year-1', year: 2026 }], execute: async (sql, params) => { writes.push({ sql, params }); return { count: 1 }; }, publish: async () => {} }),
  };
  const { routes } = await activate(undefined, database);
  const principal = { role: 'SUPER_ADMIN', userId: 'admin-1' };
  await routes.get('POST study-years').handler({ principal, body: { year: 2026, startDate: '2026-10-26', endDate: '2026-12-31' } });
  await routes.get('PUT study-years/:id').handler({ principal, params: { id: 'year-1' }, body: { year: 2026, startDate: '2026-10-26', endDate: '2026-12-31' } });
  assert.match(writes[0].sql, /\$4::timestamptz,\$5::timestamptz/);
  assert.match(writes[1].sql, /"startDate"=\$3::timestamptz,"endDate"=\$4::timestamptz/);
});

test('Academic Management exposes the streamlined administration and attendance workflows', async () => {
  const { routes, permissions, navigation } = await activate();
  for (const route of [
    'GET study-years', 'POST study-years', 'GET classes', 'POST classes',
    'POST classes/:id/students/create',
    'GET officers', 'POST officers', 'PATCH officers/:id',
    'GET attendance', 'POST attendance', 'GET attendance/reports',
    'GET records', 'POST records', 'POST scan', 'PATCH records/:id/correct',
    'GET reports/summary', 'GET reports/print-data',
    'GET reports/authoritative', 'GET attendance/dashboard-authoritative',
    'GET sessions', 'POST sessions', 'GET holidays', 'POST holidays',
    'GET identifiers', 'POST identifiers', 'GET alerts',
    'GET attendance-windows', 'POST attendance-windows',
    'POST attendance-windows/:id/rotate', 'POST attendance-windows/:id/close',
    'GET attendance-windows/:id/live', 'POST student/self-scan',
    'GET student/attendance-history', 'GET attendance-self-review',
    'POST attendance-self-review/:id/decide',
    'GET student/attendance-devices', 'POST student/attendance-devices',
    'GET staff-attendance/records', 'POST staff-attendance/scan',
    'PATCH staff-attendance/records/:id/correct',
    'GET staff-attendance/reports', 'GET staff-attendance/reports/summary',
    'GET staff-attendance/reports/authoritative',
  ]) assert.ok(routes.has(route), `missing route ${route}`);
  assert.ok(permissions.some((permission) => permission.id === 'wattanam.academic-management.attendance'));
  assert.ok(permissions.some((permission) => permission.id === 'wattanam.academic-management.attendance.scan'));
  assert.ok(permissions.some((permission) => permission.id === 'wattanam.academic-management.attendance.self.scan'));
  assert.deepEqual(
    navigation.map((item) => item.id),
    ['study-years', 'classes', 'student-id-cards', 'officers', 'staff-id-cards', 'attendance-records', 'attendance-corrections', 'attendance-alerts', 'attendance-reports', 'attendance-settings', 'staff-attendance-scanner', 'staff-attendance-reports'],
  );
  assert.equal(navigation.find((item) => item.id === 'attendance-reports')?.label, 'Student Attendance Reports');

  const ui = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'page.json'), 'utf8'));
  const dashboard = ui.pages.find((candidate) => candidate.id === 'attendance-dashboard');
  assert.ok(dashboard?.components.some((component) => component.type === 'metric'), 'missing universal Attendance Dashboard metrics');
  assert.ok(dashboard?.components.some((component) => component.type === 'table' && component.options?.itemsPath === 'classProgress'), 'missing universal class attendance progress');
  for (const page of ['study-years', 'classes', 'officers', 'officer-edit', 'officer-attendance', 'attendance-records', 'attendance-scanner', 'attendance-corrections', 'attendance-reports', 'attendance-settings', 'attendance-windows', 'student-attendance-scan', 'attendance-self-review', 'staff-attendance-scanner', 'staff-attendance-reports']) {
    assert.ok(ui.pages.some((candidate) => candidate.id === page), `missing UI page ${page}`);
  }
  const studyYears = ui.pages.find((candidate) => candidate.id === 'study-years');
  assert.ok(studyYears.components.some((component) => component.type === 'form' && component.source === 'createStudyYear'), 'missing universal Academic Year creation workflow');
  assert.ok(studyYears.components.some((component) => component.type === 'table' && component.options?.rowActions?.some((action) => action.source === 'setCurrentStudyYear')), 'missing per-record current Academic Year action');
  const classes = ui.pages.find((candidate) => candidate.id === 'classes');
  const classManager = classes.components.find((component) => component.type === 'class-manager');
  assert.ok(classManager, 'missing guided class management workflow');
  assert.equal(classManager.source, 'classes');
  assert.deepEqual(
    [classManager.options?.teachersSource, classManager.options?.classAdminsSource, classManager.options?.studyYearsSource],
    ['teachers', 'classAdmins', 'studyYears'],
    'class create and edit workflows must use named directory selectors',
  );
  assert.equal(classManager.options?.createSource, 'createClass');
  assert.equal(classManager.options?.updateSource, 'updateClass');
  assert.equal(classManager.options?.deleteSource, 'deleteClass');
  assert.ok(classes.dataSources.some((source) => source.id === 'createClassStudent' && source.path === 'classes/:classId/students/create'), 'missing direct class student creation source');
  assert.ok(classes.dataSources.some((source) => source.id === 'bulkUploadClassStudents'), 'missing bounded class spreadsheet import source');
  const classDetail = ui.pages.find((candidate) => candidate.id === 'class-detail');
  const classStudents = ui.pages.find((candidate) => candidate.id === 'class-students');
  const classEdit = ui.pages.find((candidate) => candidate.id === 'class-edit');
  assert.ok(classDetail?.components.some((component) => component.type === 'workflow' && component.options?.steps?.some((step) => step.route === 'classes/:id/students')), 'class overview must link to student management');
  assert.ok(classDetail?.components.some((component) => component.type === 'workflow' && component.options?.steps?.some((step) => step.route === 'classes/edit/:id')), 'class overview must link to class editing');
  assert.ok(classStudents?.dataSources.some((source) => source.id === 'createStudent' && source.path === 'classes/:id/students/create'), 'class student page must declare direct student creation');
  assert.ok(classStudents?.dataSources.some((source) => source.id === 'bulkUploadStudents' && source.path === 'classes/:id/students/bulk-csv'), 'class student page must declare bounded CSV import');
  assert.ok(classStudents?.components.some((component) => component.type === 'form' && component.source === 'createStudent' && component.options?.idempotencyField === 'commandKey'), 'class student page must provide idempotent student creation');
  assert.ok(classStudents?.components.some((component) => component.type === 'form' && component.source === 'bulkUploadStudents' && component.fields?.some((field) => field.id === 'csv' && field.type === 'file' && field.maxBytes === 2097152)), 'class student page must provide bounded CSV file import');
  assert.ok(classStudents?.components.some((component) => component.type === 'table' && component.source === 'bulkUploadStudents' && component.options?.itemsPath === 'details'), 'class student page must show per-row CSV import results');
  assert.ok(classStudents?.components.some((component) => component.type === 'print' && component.source === 'students' && component.options?.formats?.includes('xlsx')), 'class student page must provide Excel roster export');
  assert.ok(classStudents?.components.some((component) => component.type === 'table' && component.options?.rowClickable && component.options?.rowRoute === 'classes/:id/students/:studentId'), 'class student rows must open the student editor');
  assert.ok(classEdit?.components.some((component) => component.type === 'form' && component.source === 'saveClass' && component.options?.initialSource === 'class'), 'class edit page must provide an initialized edit form');
  const officers = ui.pages.find((candidate) => candidate.id === 'officers');
  const officerManager = officers.components.find((component) => component.type === 'officer-manager');
  assert.ok(officerManager, 'missing guided officer management workflow');
  assert.equal(officerManager.options.departmentsSource, 'officerDepartments');
  assert.equal(officerManager.options.createSource, 'createOfficer');
  assert.equal(officerManager.options.deactivateSource, 'deactivateOfficer');
  const officerEdit = ui.pages.find((candidate) => candidate.id === 'officer-edit');
  assert.ok(officerEdit.components.some((component) => component.type === 'form' && component.fields?.some((field) => field.id === 'photoUrl' && field.type === 'url')), 'officer edit must expose a secure photo URL');
  const settings = ui.pages.find((candidate) => candidate.id === 'attendance-settings');
  assert.ok(settings.components.some((component) => component.type === 'session-manager'), 'missing dedicated Session Time Settings workspace');
  const attendance = ui.pages.find((candidate) => candidate.id === 'attendance-records');
  assert.ok(attendance.components.some((component) => component.type === 'form' && component.source === 'saveRecord'), 'missing universal Take Attendance form');
  assert.ok(attendance.components.some((component) => component.type === 'table' && component.source === 'records'), 'missing universal attendance records table');
  assert.ok(attendance.dataSources.some((source) => source.id === 'classStudents' && source.autoload === false), 'missing runtime class roster source');
  const studentScanner = ui.pages.find((candidate) => candidate.id === 'student-attendance-scan');
  assert.ok(studentScanner?.components.some((component) => component.type === 'scanner'), 'student scanner must use the universal scanner workspace');
  assert.ok(studentScanner?.dataSources.some((source) => source.id === 'selfScan' && source.path === 'student/self-scan'), 'student scanner must submit to the secure self-scan route');
  const attendanceWindows = ui.pages.find((candidate) => candidate.id === 'attendance-windows');
  assert.ok(attendanceWindows?.components.some((component) => component.type === 'form' && component.source === 'openWindow'), 'missing universal attendance window creation workflow');
  assert.ok(attendanceWindows?.components.some((component) => component.type === 'table' && component.options?.rowActions?.some((action) => action.source === 'rotateWindow')), 'missing per-record attendance window rotation action');
  assert.ok(attendanceWindows?.dataSources.some((source) => source.id === 'windowLive' && source.path === 'attendance-windows/:id/live'), 'attendance window workspace requires live confirmation data');
  const staffScanner = ui.pages.find((candidate) => candidate.id === 'staff-attendance-scanner');
  const staffScannerComponent = staffScanner?.components.find((component) => component.id === 'staff-scanner');
  assert.equal(staffScannerComponent?.options?.station, true, 'staff attendance must use the fullscreen attendance-station workflow');
  assert.equal(staffScannerComponent?.options?.autoLocation, true, 'staff attendance station must capture location automatically');
  for (const pageId of ['student-id-cards', 'staff-id-cards']) {
    const cards = ui.pages.find((candidate) => candidate.id === pageId);
    assert.ok(cards?.components.some((component) => component.type === 'id-card-manager'), `missing ${pageId} workspace`);
    const manager = cards?.components.find((component) => component.type === 'id-card-manager');
    assert.ok(manager?.options?.templateSource && manager?.options?.saveTemplateSource, `missing editable ${pageId} template sources`);
    assert.ok(navigation.some((entry) => entry.id === pageId), `missing runtime navigation for ${pageId}`);
  }
  for (const pageId of ['attendance-reports', 'staff-attendance-reports']) {
    const reports = ui.pages.find((candidate) => candidate.id === pageId);
    assert.ok(reports?.components.some((component) => component.type === 'table'), `missing universal ${pageId} table`);
    assert.ok(reports?.components.some((component) => component.type === 'print'), `missing universal ${pageId} print workflow`);
  }
  assert.ok(routes.has('POST id-cards/classes/:id/ensure'), 'missing student card identifier backfill route');
  assert.ok(routes.has('GET id-cards/staff'), 'missing staff card route');
  assert.ok(routes.has('GET id-cards/templates/:type'), 'missing ID card template read route');
  assert.ok(routes.has('PUT id-cards/templates/:type'), 'missing ID card template save route');
});

test('Academic Management declares settings write access for editable templates and attendance settings', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const backendSource = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  assert.ok(manifest.capabilities.includes('settings.read'));
  assert.ok(manifest.capabilities.includes('settings.write'));
  assert.match(backendSource, /context\.settings\.set\(`id-card-template-\$\{type\}`/);
  assert.match(backendSource, /context\.settings\.set\('attendance-session-settings'/);
});

test('direct class student creation casts date-of-birth input to PostgreSQL date', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  assert.match(
    source,
    /classes\/:id\/students\/create[\s\S]*?"dateOfBirth"[\s\S]*?\$8::date/,
    'student creation must cast the bound date string before inserting it into a DATE column',
  );
});

test('merged attendance resolves class rosters from Academic Management tables', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  assert.match(source, /directory:\s*\{[\s\S]*?getClassRoster,[\s\S]*?resolveAttendanceIdentifier:/);
  assert.match(source, /FROM \$\{ENROLLMENT\} WHERE "classId" = \$1 AND "validFrom" <= \$2::date/);
  assert.doesNotMatch(source, /getClassRoster:\s*context\.directory\.getClassRoster/);
});

test('attendance advisory locks use the transactional query API', () => {
  for (const file of ['attendance-runtime.js', 'self-attendance.js', 'staff-attendance.js']) {
    const source = fs.readFileSync(path.join(root, 'backend', file), 'utf8');
    assert.doesNotMatch(source, /tx\.execute\(`SELECT pg_advisory_xact_lock/, `${file} must not send a SELECT through execute()`);
    assert.match(source, /tx\.query\(`SELECT pg_advisory_xact_lock\([\s\S]*?\)::text AS "locked" FROM \(SELECT COUNT\(\*\) FROM \$\{/, `${file} must cast the lock result without exposing the function as a FROM relation`);
    assert.doesNotMatch(source, /FROM pg_advisory_xact_lock/, `${file} must not expose the lock function to plugin table namespace validation`);
  }
});

test('attendance scan writes cast ISO timestamp parameters for PostgreSQL', () => {
  const runtime = fs.readFileSync(path.join(root, 'backend', 'attendance-runtime.js'), 'utf8');
  const staff = fs.readFileSync(path.join(root, 'backend', 'staff-attendance.js'), 'utf8');
  const self = fs.readFileSync(path.join(root, 'backend', 'self-attendance.js'), 'utf8');
  assert.match(runtime, /"clientTimestamp"[\s\S]*?\$6::timestamptz/);
  assert.match(staff, /"clientTimestamp"[\s\S]*?\$6::timestamptz/);
  assert.match(self, /"scannedAt"[\s\S]*?\$11::timestamptz/);
});

test('every Academic Management migration uses the verified single-statement format', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  for (const migration of manifest.migrations.filter((item) => Number(item.id.slice(0, 3)) >= 11)) {
    const source = fs.readFileSync(path.join(root, migration.path), 'utf8');
    assert.match(source, new RegExp(`^-- wattanam-plugin-migration: ${migration.id}(?:\\r?\\n|$)`), `missing identity header for ${migration.id}`);
    assert.ok((source.match(/;/g) || []).length <= 1, `${migration.id} contains more than one SQL statement`);
  }
});

test('officer workflow rejects student identities before storing a profile', async () => {
  const directory = {
    lookupUsers: async (ids) => ids.map((id) => ({ id, name: 'Student', role: 'STUDENT' })),
    resolveAudience: async () => [],
  };
  const { routes } = await activate(directory);
  await assert.rejects(
    routes.get('POST officers').handler({ principal: { userId: 'admin-1', role: 'ADMIN' }, body: { userId: 'student-1' } }),
    /cannot be assigned to student or parent accounts/,
  );
});

test('officer creation derives a valid deterministic command key from the email', async () => {
  const calls = [];
  const database = {
    query: async () => [],
    execute: async () => ({ count: 1 }),
    transaction: async (work) => work({ execute: async () => ({ count: 1 }) }),
  };
  const accounts = {
    createStaff: async (input) => {
      calls.push(input);
      return { id: '11111111-1111-4111-8111-111111111111', name: input.name, email: input.email, role: input.role };
    },
    createStudent: async () => ({}),
    updateStudent: async () => ({}),
  };
  const { routes } = await activate(undefined, database, accounts);
  const request = {
    principal: { userId: 'admin-1', role: 'ADMIN' },
    body: { name: 'Teacher One', email: 'Teacher.One@example.com', password: 'Password1', position: 'TEACHER', photoUrl: 'https://images.example.test/teacher-one.jpg' },
  };
  await routes.get('POST officers').handler(request);
  await routes.get('POST officers').handler(request);
  assert.equal(calls.length, 2);
  assert.match(calls[0].commandKey, /^officer:[a-f0-9]{32}$/);
  assert.equal(calls[0].commandKey, calls[1].commandKey);
  assert.equal(calls[0].email, 'teacher.one@example.com');
  assert.equal(calls[0].photo, 'https://images.example.test/teacher-one.jpg');
});

test('officer creation casts bound UUID and date values for PostgreSQL', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  assert.match(
    source,
    /INSERT INTO \$\{OFFICER\}[\s\S]*?VALUES \(\$1::uuid,\$2::uuid,\$3,\$4,\$5::uuid,\$6,\$7::date,\$8::date,\$9,\$10\)/,
  );
});

test('staff ID card queries cast officer UUIDs before joining text identifiers', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  const joins = source.match(/ai\."personId"=o\."id"::text/g) || [];
  assert.equal(joins.length, 2);
});

test('officer and staff attendance SQL uses explicit PostgreSQL types', () => {
  const index = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  const staff = fs.readFileSync(path.join(root, 'backend', 'staff-attendance.js'), 'utf8');
  assert.match(index, /WHERE o\."id" = \$1::uuid LIMIT 1/);
  assert.match(index, /a\."attendanceDate" = \$1::date/);
  assert.match(index, /a\."attendanceDate" BETWEEN \$1::date AND \$2::date/);
  assert.match(staff, /d\."id"=o\."departmentId"::text WHERE o\."id"=\$1::uuid/);
});

test('staff attendance defaults and current Study Year repair are migrated', () => {
  const currentYear = fs.readFileSync(path.join(root, 'migrations', '057_ensure_current_study_year.sql'), 'utf8');
  const removeStudentOnlyConstraint = fs.readFileSync(path.join(root, 'migrations', '058_seed_staff_attendance_sessions.sql'), 'utf8');
  const allowStaffSessions = fs.readFileSync(path.join(root, 'migrations', '059_allow_staff_attendance_sessions.sql'), 'utf8');
  const staffSessions = fs.readFileSync(path.join(root, 'migrations', '060_seed_staff_attendance_sessions.sql'), 'utf8');
  assert.match(currentYear, /NOT EXISTS[\s\S]*?"isCurrent" = TRUE/);
  assert.match(removeStudentOnlyConstraint, /DROP CONSTRAINT IF EXISTS academic_management_attendance_session_student_only/);
  assert.match(allowStaffSessions, /"scope" IN \('STUDENT', 'TEACHER', 'STAFF'\)/);
  assert.equal((staffSessions.match(/'STAFF'/g) || []).length, 4);
  assert.match(staffSessions, /1, 'CHECK_IN'/);
  assert.match(staffSessions, /2, 'CHECK_OUT'/);
  assert.match(staffSessions, /3, 'CHECK_IN'/);
  assert.match(staffSessions, /4, 'CHECK_OUT'/);
});

test('staff navigation exposes one canonical attendance workflow', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const ids = manifest.navigation.map((item) => item.id);
  assert.ok(ids.includes('staff-attendance-scanner'));
  assert.ok(ids.includes('staff-attendance-reports'));
  assert.ok(!ids.includes('officer-attendance'));
  assert.ok(!ids.includes('officer-attendance-reports'));
});

test('student checkout scans persist checkout timestamps', () => {
  const runtime = fs.readFileSync(path.join(root, 'backend', 'attendance-runtime.js'), 'utf8');
  assert.match(runtime, /SELECT "session", "type", "startTime", "endTime"/);
  assert.match(runtime, /checkOutTime: activeSession\.type === 'CHECK_OUT'/);
  assert.match(runtime, /"checkInTime","checkOutTime"/);
});

test('every published Academic Management event has an explicit version', () => {
  for (const file of fs.readdirSync(path.join(root, 'backend')).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, 'backend', file), 'utf8');
    for (const match of source.matchAll(/events\.publish\('([^']+)'/g)) {
      assert.match(match[1], /\.v\d+$/, `${file} publishes an unversioned event: ${match[1]}`);
    }
  }
});

test('attendance workflow rejects unsupported statuses before writing', async () => {
  const { routes } = await activate();
  await assert.rejects(
    routes.get('POST attendance').handler({ principal: { userId: 'admin-1', role: 'ADMIN' }, body: { officerId: 'officer-1', attendanceDate: '2026-10-06', status: 'UNKNOWN' } }),
    /Invalid attendance status/,
  );
});

test('authoritative student reports materialize absence only for elapsed working sessions', async () => {
  const routes = new Map();
  const previousWeekday = new Date();
  do previousWeekday.setUTCDate(previousWeekday.getUTCDate() - 1); while ([0, 6].includes(previousWeekday.getUTCDay()));
  const reportDate = previousWeekday.toISOString().slice(0, 10);
  registerAuthoritativeReports({
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); } },
    settings: { get: async (_key, fallback) => fallback },
    database: { query: async (sql) => {
      if (sql.includes(`FROM plugin_wattanam_academic_management_class `)) return [{ id: 'class-1', name: 'A', schedule: JSON.stringify({ week: ['MON','TUE','WED','THU','FRI'] }) }];
      if (sql.includes(`FROM plugin_wattanam_academic_management_attendance_session`)) return [{ scope: 'STUDENT', classId: '', session: 1, type: 'CHECK_IN', startTime: '00:00', endTime: '00:01' }];
      if (sql.includes(`FROM plugin_wattanam_academic_management_attendance_holiday`)) return [];
      if (sql.includes(`FROM plugin_wattanam_academic_management_attendance_record`)) return [];
      return [];
    } },
    directory: { getClassRoster: async () => ({ className: 'A', students: [{ studentId: 'student-1', studentNumber: '0001', name: 'Student One' }] }), lookupUsers: async () => [] },
  });
  const result = await routes.get('GET reports/authoritative').handler({ query: { classId: 'class-1', startDate: reportDate, endDate: reportDate }, principal: { role: 'ADMIN', userId: 'admin-1' } });
  assert.equal(result.totals.expected, 1);
  assert.equal(result.totals.absent, 1);
  assert.equal(result.entries[0].source, 'EXPECTED_SESSION');
});

test('authoritative reports preserve real scans on non-working days without false absences', async () => {
  const routes = new Map();
  const future = new Date(); future.setUTCDate(future.getUTCDate() + ((7 - future.getUTCDay()) % 7 || 7));
  const reportDate = future.toISOString().slice(0, 10);
  const databaseDate = new Date(`${reportDate}T00:00:00.000Z`);
  const studentRecord = { personId: 'student-1', personType: 'STUDENT', classId: 'class-1', date: databaseDate, session: 3, status: 'PRESENT', personNameSnapshot: 'Student One', personNumberSnapshot: '0001' };
  const staffRecord = { personId: 'officer-1', personType: 'STAFF', date: databaseDate, session: 3, status: 'PRESENT', personNameSnapshot: 'Officer One', personNumberSnapshot: 'E001' };
  registerAuthoritativeReports({
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); } },
    settings: { get: async (key, fallback) => key === 'attendance-session-settings' ? { staffWorkingDays: [] } : fallback },
    database: { query: async (sql) => {
      if (sql.includes(`FROM plugin_wattanam_academic_management_class `)) return [{ id: 'class-1', name: 'A', schedule: JSON.stringify({ week: [] }) }];
      if (sql.includes(`FROM plugin_wattanam_academic_management_officer_profile`)) return [
        { id: 'officer-1', userId: 'user-1', employeeNumber: 'E001', employmentStatus: 'ACTIVE' },
        { id: 'officer-2', userId: 'user-2', employeeNumber: 'E002', employmentStatus: 'ACTIVE' },
      ];
      if (sql.includes(`FROM plugin_wattanam_academic_management_attendance_session`)) return [
        { scope: 'STUDENT', classId: '', session: 1, type: 'CHECK_IN', startTime: '23:58', endTime: '23:59' },
        { scope: 'STAFF', classId: '', session: 1, type: 'CHECK_IN', startTime: '23:58', endTime: '23:59' },
      ];
      if (sql.includes(`FROM plugin_wattanam_academic_management_attendance_holiday`)) return [];
      if (sql.includes(`FROM plugin_wattanam_academic_management_attendance_record`)) return sql.includes(`"personType"='STAFF'`) ? [staffRecord] : [studentRecord];
      return [];
    } },
    directory: {
      getClassRoster: async () => ({ className: 'A', students: [
        { studentId: 'student-1', studentNumber: '0001', name: 'Student One' },
        { studentId: 'student-2', studentNumber: '0002', name: 'Student Two' },
      ] }),
      lookupUsers: async () => [{ id: 'user-1', name: 'Officer One' }, { id: 'user-2', name: 'Officer Two' }],
    },
  });
  const student = await routes.get('GET reports/authoritative').handler({ query: { classId: 'class-1', startDate: reportDate, endDate: reportDate } });
  const staff = await routes.get('GET staff-attendance/reports/authoritative').handler({ query: { startDate: reportDate, endDate: reportDate } });
  assert.equal(student.totals.present, 1);
  assert.equal(student.totals.absent, 0);
  assert.deepEqual(student.people.map((person) => person.id), ['student-1']);
  assert.equal(staff.totals.present, 1);
  assert.equal(staff.totals.absent, 0);
  assert.deepEqual(staff.people.map((person) => person.id), ['officer-1']);
});

test('authoritative student reports exclude configured holidays', async () => {
  const routes = new Map(); const date = '2026-10-07';
  registerAuthoritativeReports({
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); } }, settings: { get: async (_key, fallback) => fallback },
    database: { query: async (sql) => sql.includes(`_class `) ? [{ id: 'class-1', name: 'A', schedule: JSON.stringify({ week: ['WED'] }) }] : sql.includes(`_session`) ? [{ scope: 'STUDENT', classId: '', session: 1, startTime: '00:00', endTime: '00:01' }] : sql.includes(`_holiday`) ? [{ date }] : [] },
    directory: { getClassRoster: async () => { throw new Error('holiday roster must not be loaded'); }, lookupUsers: async () => [] },
  });
  const result = await routes.get('GET reports/authoritative').handler({ query: { classId: 'class-1', startDate: date, endDate: date } });
  assert.equal(result.totals.expected, 0);
  assert.deepEqual(result.excludedHolidays, [date]);
});

test('student self attendance rejects a modified signed QR', async () => {
  const harness = selfScanHarness();
  const result = await harness.handler({
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'tamper-1', attendanceToken: tamperSignedToken(harness.token), clientTimestamp: harness.now.toISOString() },
  });
  assert.equal(result.result, 'INVALID_QR');
  assert.match(result.rejectionReason, /Signature/);
});

test('student self attendance rejects scans on a class day marked off', async () => {
  const harness = selfScanHarness({ studyDays: [] });
  const result = await harness.handler({
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'day-off-1', attendanceToken: harness.token, clientTimestamp: harness.now.toISOString() },
  });
  assert.equal(result.result, 'DAY_OFF');
  assert.match(result.rejectionReason, /not a study day/);
  assert.equal(harness.records.length, 0);
});

test('student self attendance enforces token expiry and class enrollment', async () => {
  const expired = selfScanHarness({ claims: { issuedAt: 1, expiresAt: 2 } });
  const expiredResult = await expired.handler({
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'expired-1', attendanceToken: expired.token, clientTimestamp: expired.now.toISOString() },
  });
  assert.equal(expiredResult.result, 'EXPIRED_QR');

  const wrongClass = selfScanHarness({ enrollment: { enrolled: true, classId: 'class-2' } });
  const wrongClassResult = await wrongClass.handler({
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'class-1', attendanceToken: wrongClass.token, clientTimestamp: wrongClass.now.toISOString() },
  });
  assert.equal(wrongClassResult.result, 'WRONG_CLASS');
});

test('student self attendance enforces location, registered device, and student role policies', async () => {
  const location = selfScanHarness({ window: { locationRequired: true } });
  const locationResult = await location.handler({
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'location-1', attendanceToken: location.token, clientTimestamp: location.now.toISOString(), latitude: 12, longitude: 105, accuracyMeters: 10 },
  });
  assert.equal(locationResult.result, 'REQUIRES_REVIEW');
  assert.match(locationResult.rejectionReason, /OUTSIDE_GEOFENCE/);

  const device = selfScanHarness({ window: { registeredDeviceRequired: true } });
  const deviceResult = await device.handler({
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'device-1', attendanceToken: device.token, clientTimestamp: device.now.toISOString() },
  });
  assert.equal(deviceResult.result, 'DEVICE_REJECTED');

  const role = selfScanHarness();
  const roleResult = await role.handler({
    principal: { userId: 'officer-1', role: 'OFFICER' },
    body: { clientRequestId: 'role-1', attendanceToken: role.token, clientTimestamp: role.now.toISOString() },
  });
  assert.equal(roleResult.result, 'UNAUTHORIZED');
});

test('student self attendance returns a stable idempotent result for retried client requests', async () => {
  const harness = selfScanHarness();
  const invalidToken = tamperSignedToken(harness.token);
  const request = {
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'retry-1', attendanceToken: invalidToken, clientTimestamp: harness.now.toISOString() },
  };
  const first = await harness.handler(request);
  const second = await harness.handler(request);
  assert.equal(first.result, 'INVALID_QR');
  assert.equal(first.idempotentReplay, false);
  assert.equal(second.result, first.result);
  assert.equal(second.rejectionReason, first.rejectionReason);
  assert.equal(second.idempotentReplay, true);
  assert.equal(harness.audits.length, 1);
});

test('valid student self attendance creates exactly one record across repeated submissions', async () => {
  const harness = selfScanHarness();
  const request = {
    principal: { userId: 'user-1', role: 'STUDENT' },
    body: { clientRequestId: 'accepted-1', attendanceToken: harness.token, clientTimestamp: harness.now.toISOString(), networkQuality: 'good' },
  };
  const first = await harness.handler(request);
  const second = await harness.handler(request);
  assert.ok(['RECORDED', 'LATE'].includes(first.result));
  assert.equal(first.idempotentReplay, false);
  assert.equal(second.result, first.result);
  assert.equal(second.idempotentReplay, true);
  assert.equal(harness.records.length, 1);
  assert.equal(harness.audits.length, 1);
});

