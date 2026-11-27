'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', 'plugins', 'wattanam.academic-management');
// Since Academic Management 0.35.0 the screens that TAKE attendance are Smart Attendance's (partner screens);
// the records, rules and reports stay here.
const smartRoot = path.resolve(__dirname, '..', 'plugins', 'wattanam.smart-attendance');
const smartUi = JSON.parse(fs.readFileSync(path.join(smartRoot, 'frontend', 'page.json'), 'utf8'));
const { ROUTES: smartCallers } = require(path.join(root, 'backend', 'smart-attendance-callers.js'));
const plugin = require(path.join(root, 'backend', 'index.js'));
const { registerAuthoritativeReports } = require(path.join(root, 'backend', 'authoritative-reports.js'));
const { registerSelfAttendance } = require(path.join(root, 'backend', 'self-attendance.js'));

test('officer photo migration declares its constraint replacement as destructive', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const migration = manifest.migrations.find((item) => item.id === '061_add_officer_photo_url');
  assert.ok(migration, 'officer photo migration is missing');
  assert.equal(migration.destructive, true);
});

test('Academic Management uses the universal SDK 1.3 UI contract', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'page.json'), 'utf8'));
  const universal = new Set(['heading','text','workflow','status','card','metric','table','form','detail','chart','file','print','document','designer','scanner','filter','actions','id-card-manager','session-manager','profile-manager','class-manager','officer-manager','take-attendance','app']);
  const components = descriptor.pages.flatMap((page) => page.components || []);
  assert.equal(manifest.sdkVersion, '1.3.0');
  assert.deepEqual(manifest.hostContracts, ['wattanam.academic.directory.v1', 'wattanam.academic.identity.v1']);
  assert.equal(descriptor.portability, 'universal');
  assert.ok(components.every((component) => universal.has(component.type)), 'host-specific component remains in universal descriptor');
  assert.equal(components.filter((component) => component.type === 'actions').length, 0);
  assert.equal(components.filter((component) => component.type === 'table' && component.options?.selectable).length, 0);
  const recordActions = components.reduce((count, component) => count + (component.options?.rowActions?.length || 0), 0)
    // The officers screen is the plugin's own (ui/officers) and carries its edit, deactivate and delete actions.
    + components.filter((component) => component.type === 'app' && component.options?.entry === 'ui/officers/index.html').length
    // So is Academic Years (ui/study-years): set current and delete on each year.
    + 2 * descriptor.pages.filter((page) => page.id === 'study-years' && page.components.some((component) => component.options?.entry === 'ui/study-years/index.html')).length;
  // The self-attendance window and review actions moved to Smart Attendance in 0.35.0.
  assert.ok(recordActions >= 6);
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

test('Academic Year writes keep browser dates as days and save the school name and logo', async () => {
  const writes = [];
  const database = {
    query: async (sql) => sql.includes('_study_year') && !sql.includes('"year" = $1') ? [{ id: 'year-1', year: 2026 }] : [],
    execute: async (sql, params) => { writes.push({ sql, params }); return { count: 1 }; },
    transaction: async (work) => work({ query: async () => [{ id: 'year-1', year: 2026 }], execute: async (sql, params) => { writes.push({ sql, params }); return { count: 1 }; }, publish: async () => {} }),
  };
  const { routes } = await activate(undefined, database);
  const principal = { role: 'SUPER_ADMIN', userId: 'admin-1' };
  await routes.get('POST study-years').handler({ principal, body: { year: 2026, startDate: '2026-10-26', endDate: '2026-12-31' } });
  const logo = 'data:image/png;base64,iVBORw0KGgo=';
  await routes.get('PUT study-years/:id').handler({ principal, params: { id: 'year-1' }, body: { year: 2026, startDate: '2026-10-26T00:00:00.000Z', endDate: '2026-12-31', schoolName: ' Wattanam High School ', logoUrl: logo } });
  assert.match(writes[0].sql, /\$4::date,\$5::date/);
  assert.match(writes[1].sql, /"startDate"=\$3::date,"endDate"=\$4::date/);
  assert.deepEqual(writes[1].params.slice(2, 6), ['2026-10-26', '2026-12-31', 'Wattanam High School', logo]);
  await assert.rejects(routes.get('PUT study-years/:id').handler({ principal, params: { id: 'year-1' }, body: { year: 2026, startDate: '2026-12-31', endDate: '2026-10-26' } }), /endDate/);
  await assert.rejects(routes.get('PUT study-years/:id').handler({ principal, params: { id: 'year-1' }, body: { year: 2026, logoUrl: 'javascript:alert(1)' } }), /logo/);
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
    ['attendance-dashboard', 'study-years', 'classes', 'student-id-cards', 'officers', 'staff-id-cards', 'score-sheets', 'score-entry', 'student-ranking', 'year-ranking', 'honor-roll', 'year-honor-roll', 'subject-ranking', 'year-report-cards', 'record-books', 'progress-books', 'my-class', 'student-permissions', 'attendance-corrections', 'attendance-alerts', 'attendance-reports'],
  );
  // Open to Smart Attendance's screens, and only routes this plugin registers; the class lists also to
  // Examination's exam editor (0.35.1).
  const shapes = new Map([...routes].map(([key, route]) => [key.replace(/:[^/]+/g, ':id'), route]));
  const examCallers = ['GET classes', 'GET my/classes'];
  for (const route of smartCallers) assert.deepEqual(shapes.get(route)?.callers, examCallers.includes(route) ? ['wattanam.smart-attendance', 'wattanam.examination'] : ['wattanam.smart-attendance'], `${route} is registered and open to its partner screens`);
  assert.deepEqual(require(path.join(root, 'backend', 'smart-attendance-callers.js')).EXAM_ROUTES, examCallers);
  assert.equal(routes.get('PATCH records/:id/correct')?.callers, undefined, 'corrections stay with Academic Management');
  assert.equal(navigation.find((item) => item.id === 'attendance-reports')?.label, 'Student Attendance Reports');

  const ui = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'page.json'), 'utf8'));
  const dashboard = ui.pages.find((candidate) => candidate.id === 'attendance-dashboard');
  // The Attendance Dashboard is the plugin's own screen (summaries, class progress, trend, milestones).
  assert.equal(dashboard?.components.find((component) => component.type === 'app')?.options?.entry, 'ui/dashboard/index.html', 'missing Attendance Dashboard screen');
  const dashboardScript = fs.readFileSync(path.join(root, 'ui/dashboard/dashboard.js'), 'utf8');
  for (const call of ["ui.api.get('dashboard/day'", "ui.api.get('dashboard/month'", "ui.api.get('dashboard/milestones')"]) assert.ok(dashboardScript.includes(call), `dashboard must use ${call}`);
  assert.ok(routes.has('GET dashboard/day') && routes.has('GET dashboard/month') && routes.has('GET dashboard/milestones'), 'missing dashboard routes');
  for (const page of ['study-years', 'classes', 'officers', 'officer-edit', 'officer-attendance', 'attendance-corrections', 'attendance-reports']) {
    assert.ok(ui.pages.some((candidate) => candidate.id === page), `missing UI page ${page}`);
  }
  const studyYears = ui.pages.find((candidate) => candidate.id === 'study-years');
  // Since 0.17.0 Academic Years is the plugin's own screen (dates, school name, logo, current year).
  assert.equal(studyYears.components.find((component) => component.type === 'app')?.options?.entry, 'ui/study-years/index.html', 'missing Academic Years screen');
  for (const source of ['studyYears', 'createStudyYear', 'saveStudyYear', 'setCurrentStudyYear', 'deleteStudyYear']) assert.ok(studyYears.dataSources.some((s) => s.id === source), `Academic Years must declare ${source}`);
  const yearScreen = fs.readFileSync(path.join(root, 'ui/study-years/study-years.js'), 'utf8');
  for (const call of ["ui.api.get('study-years')", "ui.api.post('study-years', body)", "ui.api.put('study-years/' + encodeURIComponent(editing.id), body)", "'/set-current'", "ui.api.delete('study-years/' + encodeURIComponent(item.id))"]) assert.ok(yearScreen.includes(call), `Academic Years screen must use ${call}`);
  const classes = ui.pages.find((candidate) => candidate.id === 'classes');
  // Since 0.5.0 the guided class workflow is the plugin's own screen, not one built into the core.
  const classManager = classes.components.find((component) => component.type === 'app');
  assert.equal(classManager?.options?.entry, 'ui/classes/index.html', 'missing guided class management workflow');
  const classScreen = fs.readFileSync(path.join(root, 'ui/classes/classes.js'), 'utf8');
  for (const call of ["ui.api.get('teachers')", "ui.api.get('class-admins')", "ui.api.get('study-years')"]) {
    assert.ok(classScreen.includes(call), `class create and edit workflows must use named directory selectors (${call})`);
  }
  for (const call of ["ui.api.post('classes', body)", "ui.api.put(path('classes/', editing.id), body)", "ui.api.delete(path('classes/', row.id))", "'/students/create')", "'/students/bulk-csv')", "ui.navigate('attendance', { classId: row.id })"]) {
    assert.ok(classScreen.includes(call), `class screen must use ${call}`);
  }
  assert.ok(classes.dataSources.some((source) => source.id === 'createClassStudent' && source.path === 'classes/:classId/students/create'), 'missing direct class student creation source');
  assert.ok(classes.dataSources.some((source) => source.id === 'bulkUploadClassStudents'), 'missing bounded class spreadsheet import source');
  const classDetail = ui.pages.find((candidate) => candidate.id === 'class-detail');
  const classStudents = ui.pages.find((candidate) => candidate.id === 'class-students');
  const classEdit = ui.pages.find((candidate) => candidate.id === 'class-edit');
  assert.ok(classDetail?.components.some((component) => component.type === 'workflow' && component.options?.steps?.some((step) => step.route === 'classes/:id/students')), 'class overview must link to student management');
  assert.ok(classDetail?.components.some((component) => component.type === 'workflow' && component.options?.steps?.some((step) => step.route === 'classes/edit/:id')), 'class overview must link to class editing');
  assert.ok(classStudents?.dataSources.some((source) => source.id === 'createStudent' && source.path === 'classes/:id/students/create'), 'class student page must declare direct student creation');
  assert.ok(classStudents?.dataSources.some((source) => source.id === 'bulkUploadStudents' && source.path === 'classes/:id/students/bulk-csv'), 'class student page must declare bounded CSV import');
  assert.ok(classStudents?.dataSources.some((source) => source.id === 'availableStudents' && source.path === 'classes/:id/available-students'), 'class student page must load eligible existing profiles');
  assert.ok(classStudents?.components.some((component) => component.type === 'form' && component.source === 'createStudent' && component.options?.idempotencyField === 'commandKey'), 'class student page must provide idempotent student creation');
  assert.ok(classStudents?.components.some((component) => component.type === 'form' && component.source === 'bulkUploadStudents' && component.fields?.some((field) => field.id === 'csv' && field.type === 'file' && field.maxBytes === 2097152)), 'class student page must provide bounded CSV file import');
  assert.ok(classStudents?.components.some((component) => component.type === 'table' && component.source === 'bulkUploadStudents' && component.options?.itemsPath === 'details'), 'class student page must show per-row CSV import results');
  assert.ok(classStudents?.components.some((component) => component.type === 'form' && component.source === 'addStudent' && component.fields?.some((field) => field.id === 'studentId' && field.type === 'select' && field.optionsSource === 'availableStudents')), 'existing student enrollment must use a named profile selector');
  assert.ok(classStudents?.components.some((component) => component.type === 'print' && component.source === 'students' && component.options?.formats?.includes('xlsx')), 'class student page must provide Excel roster export');
  assert.ok(classStudents?.components.some((component) => component.type === 'table' && component.options?.rowClickable && component.options?.rowRoute === 'classes/:id/students/:studentId'), 'class student rows must open the student editor');
  assert.ok(classEdit?.components.some((component) => component.type === 'form' && component.source === 'saveClass' && component.options?.initialSource === 'class'), 'class edit page must provide an initialized edit form');
  const officers = ui.pages.find((candidate) => candidate.id === 'officers');
  // Since 0.4.0 the guided officer workflow is the plugin's own screen, not one built into the core.
  const officerManager = officers.components.find((component) => component.type === 'app');
  assert.equal(officerManager?.options?.entry, 'ui/officers/index.html', 'missing guided officer management workflow');
  const officerScreen = fs.readFileSync(path.join(root, 'ui/officers/officers.js'), 'utf8');
  for (const call of ["ui.api.get('officers')", "ui.api.get('departments')", "ui.api.post('officers'", "ui.api.patch('officers/'", "ui.api.delete('officers/'", "ui.navigate('officers/edit/'"]) {
    assert.ok(officerScreen.includes(call), `officer screen must call ${call}`);
  }
  assert.ok(officers.dataSources.some((source) => source.id === 'deleteOfficer' && source.method === 'DELETE'), 'officer CRUD requires a guarded delete source');
  const officerEdit = ui.pages.find((candidate) => candidate.id === 'officer-edit');
  assert.ok(officerEdit.components.some((component) => component.type === 'form' && component.fields?.some((field) => field.id === 'photoUrl' && field.type === 'url')), 'officer edit must expose a secure photo URL');
  // The screens that take attendance are Smart Attendance's: every data source calls this plugin.
  const smartPage = (id) => smartUi.pages.find((candidate) => candidate.id === id);
  const smartFile = (file) => fs.readFileSync(path.join(smartRoot, file), 'utf8');
  for (const id of ['take', 'attendance-settings', 'self-windows', 'self-scan', 'self-review', 'staff', 'staff-reports']) {
    assert.ok(smartPage(id)?.dataSources.every((source) => source.plugin === 'wattanam.academic-management'), `Smart Attendance ${id} calls Academic Management`);
  }
  const settings = smartPage('attendance-settings');
  assert.ok(settings.components.some((component) => component.type === 'app' && component.options?.entry === 'ui/sessions/index.html'), 'missing dedicated Session Time Settings screen');
  assert.ok(fs.existsSync(path.join(smartRoot, 'ui', 'sessions', 'index.html')), 'Session Time Settings screen files are missing');
  const attendance = smartPage('take');
  const takeAttendance = attendance.components.find((component) => component.type === 'app');
  assert.equal(takeAttendance?.options?.entry, 'ui/take/index.html', 'missing guided student attendance station');
  assert.deepEqual(takeAttendance.options.devices, ['scanner', 'location'], 'attendance station must declare the scanner and location');
  assert.deepEqual(takeAttendance.options.apis, ['wattanam.academic-management']);
  const attendanceScreen = smartFile('ui/take/attendance.js');
  for (const call of ["academic.get('my/classes')", "academic.get('sessions')", "academic.get('records'", "'/students')", "academic.post('records'", "academic.post('scan'", 'ui.scanner.start(']) {
    assert.ok(attendanceScreen.includes(call), `student attendance station must use ${call}`);
  }
  assert.ok(attendance.dataSources.some((source) => source.id === 'classStudents' && source.autoload === false), 'missing runtime class roster source');
  for (const moved of ['attendance-records', 'attendance-settings', 'attendance-windows', 'student-attendance-scan', 'attendance-self-review', 'staff-attendance-scanner', 'staff-attendance-reports', 'attendance-scanner']) {
    assert.equal(ui.pages.some((candidate) => candidate.id === moved), false, `${moved} is a Smart Attendance screen now`);
  }
  for (const gone of ['ui/attendance', 'ui/sessions', 'ui/student-attendance', 'ui/reports/staff.html']) assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} moved to Smart Attendance`);
  const studentScanner = smartPage('self-scan');
  const studentScreen = studentScanner?.components.find((component) => component.type === 'app');
  assert.equal(studentScreen?.options?.entry, 'ui/self-scan/index.html', 'student scanner must use the student attendance screen');
  assert.deepEqual(studentScreen.options.devices, ['scanner', 'location', 'device-id'], 'student scanner must declare the camera, location and device identifier');
  const studentScript = smartFile('ui/self-scan/student-attendance.js');
  for (const call of ["academic.post('student/self-scan'", "academic.get('student/attendance-history')", "academic.get('student/attendance-devices'", "academic.post('student/attendance-devices'", 'clientRequestId: newKey()', 'ui.scanner.start(']) {
    assert.ok(studentScript.includes(call), `student scanner must use ${call}`);
  }
  assert.ok(studentScanner?.dataSources.some((source) => source.id === 'selfScan' && source.path === 'student/self-scan'), 'student scanner must submit to the secure self-scan route');
  const attendanceWindows = smartPage('self-windows');
  assert.ok(attendanceWindows?.components.some((component) => component.type === 'form' && component.source === 'openWindow'), 'missing universal attendance window creation workflow');
  assert.ok(attendanceWindows?.components.some((component) => component.type === 'table' && component.options?.rowActions?.some((action) => action.source === 'rotateWindow')), 'missing per-record attendance window rotation action');
  assert.ok(attendanceWindows?.dataSources.some((source) => source.id === 'windowLive' && source.path === 'attendance-windows/:id/live'), 'attendance window workspace requires live confirmation data');
  const staffScanner = smartPage('staff');
  const staffScannerComponent = staffScanner?.components.find((component) => component.id === 'staff-scanner');
  assert.equal(staffScannerComponent?.options?.station, true, 'staff attendance must use the fullscreen attendance-station workflow');
  assert.equal(staffScannerComponent?.options?.autoLocation, true, 'staff attendance station must capture location automatically');
  for (const pageId of ['student-id-cards', 'staff-id-cards']) {
    const cards = ui.pages.find((candidate) => candidate.id === pageId);
    // Since 0.4.0 the card workspace is the plugin's own screen (ui/id-cards); its page names the template routes.
    const manager = cards?.components.find((component) => component.type === 'app');
    assert.match(String(manager?.options?.entry), /^ui\/id-cards\/(student|staff)\.html$/, `missing ${pageId} workspace`);
    const cardScreen = fs.readFileSync(path.join(root, manager.options.entry), 'utf8');
    assert.match(cardScreen, /data-template="id-cards\/templates\/(student|staff)"/, `missing ${pageId} template route`);
    assert.match(cardScreen, /data-save-template="id-cards\/templates\/(student|staff)"/, `missing editable ${pageId} template route`);
    assert.ok(navigation.some((entry) => entry.id === pageId), `missing runtime navigation for ${pageId}`);
  }
  // Staff attendance reports use the same report screen in staff mode, with their own saved print form.
  // (a Smart Attendance screen since 0.35.0, calling this plugin's routes)
  const staffReports = smartUi.pages.find((candidate) => candidate.id === 'staff-reports');
  assert.equal(staffReports?.components.find((component) => component.type === 'app')?.options?.entry, 'ui/staff-reports/index.html', 'missing staff attendance report screen');
  assert.match(fs.readFileSync(path.join(smartRoot, 'ui/staff-reports/index.html'), 'utf8'), /data-mode="staff"/, 'staff report page must run the screen in staff mode');
  assert.ok(routes.has('GET reports/staff-print-template') && routes.has('PUT reports/staff-print-template'), 'missing saved staff report print form routes');
  // Student attendance reports are the plugin's own screen: daily/period report, print and a saved print form.
  const studentReports = ui.pages.find((candidate) => candidate.id === 'attendance-reports');
  assert.equal(studentReports?.components.find((component) => component.type === 'app')?.options?.entry, 'ui/reports/index.html', 'missing attendance report screen');
  const reportScript = fs.readFileSync(path.join(root, 'ui/reports/reports.js'), 'utf8');
  for (const call of ["ui.api.get('reports/print-data'", "ui.api.get('staff-attendance/reports'", "'reports/print-template'", "'reports/staff-print-template'", 'ui.api.get(TEMPLATE_PATH)', 'ui.api.put(TEMPLATE_PATH', 'window.print()']) {
    assert.ok(reportScript.includes(call), `attendance report screen must use ${call}`);
  }
  assert.ok(routes.has('GET reports/print-template') && routes.has('PUT reports/print-template'), 'missing saved report print form routes');
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

test('CSV student import reuses profiles globally and transfers their current enrollment', () => {
  const source = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  assert.match(source, /LEFT JOIN \$\{ENROLLMENT\} e ON e\."studentId" = s\."id" AND e\."validTo" IS NULL WHERE s\."studentNumber" = \$1/);
  assert.match(source, /if \(existing\.classId !== classId\)[\s\S]*?DELETE FROM \$\{ENROLLMENT\}[\s\S]*?INSERT INTO \$\{ENROLLMENT\}/);
  assert.match(source, /reusedProfile: true/);
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
  const studentSessions = fs.readFileSync(path.join(root, 'migrations', '062_seed_student_attendance_sessions.sql'), 'utf8');
  assert.match(currentYear, /NOT EXISTS[\s\S]*?"isCurrent" = TRUE/);
  assert.match(removeStudentOnlyConstraint, /DROP CONSTRAINT IF EXISTS academic_management_attendance_session_student_only/);
  assert.match(allowStaffSessions, /"scope" IN \('STUDENT', 'TEACHER', 'STAFF'\)/);
  assert.equal((staffSessions.match(/'STAFF'/g) || []).length, 4);
  assert.match(staffSessions, /1, 'CHECK_IN'/);
  assert.match(staffSessions, /2, 'CHECK_OUT'/);
  assert.match(staffSessions, /3, 'CHECK_IN'/);
  assert.match(staffSessions, /4, 'CHECK_OUT'/);
  assert.equal((studentSessions.match(/'STUDENT'/g) || []).length, 4);
  assert.match(studentSessions, /1, 'CHECK_IN'/);
  assert.match(studentSessions, /2, 'CHECK_OUT'/);
  assert.match(studentSessions, /3, 'CHECK_IN'/);
  assert.match(studentSessions, /4, 'CHECK_OUT'/);
});

test('embedded attendance durable events map to the declared Academic namespace', () => {
  const index = fs.readFileSync(path.join(root, 'backend', 'index.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  assert.match(index, /replace\('wattanam\.attendance-manager\.attendance\.', 'wattanam\.academic-management\.attendance\.'\)/);
  assert.deepEqual(manifest.contracts.events.publishes['wattanam.academic-management.attendance.recorded'], [1]);
  assert.deepEqual(manifest.contracts.events.publishes['wattanam.academic-management.attendance.corrected'], [1]);
});

test('staff navigation exposes one canonical attendance workflow', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const ids = manifest.navigation.map((item) => item.id);
  // Staff Attendance and its reports are Smart Attendance screens since Academic Management 0.35.0.
  const smartIds = JSON.parse(fs.readFileSync(path.join(smartRoot, 'plugin.json'), 'utf8')).navigation.map((item) => item.id);
  assert.ok(smartIds.includes('staff') && smartIds.includes('staff-reports'));
  assert.ok(!ids.includes('staff-attendance-scanner') && !ids.includes('staff-attendance-reports'));
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


test('Academic Management declares its own messages so users see them, and keeps other failures private', async () => {
  // the message table matches the plugin's source
  require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'generate-academic-public-errors.js'), '--check']);
  const { routes } = await activate();
  for (const [key, route] of routes) {
    assert.equal(route.contract?.version, '1.0', `${key} must declare the error contract`);
  }
  const route = routes.get('POST attendance/permissions');
  assert.equal(route.contract.errors.CLASSID_AND_STUDENTID_ARE_REQUIRED.status, 400);
  await assert.rejects(route.handler({ principal: { userId: 'u1', role: 'TEACHER' }, body: {} }),
    (error) => error.isPluginContractError === true && error.code === 'CLASSID_AND_STUDENTID_ARE_REQUIRED');
  const { publicCode } = require(path.join(root, 'backend', 'public-errors.js'));
  assert.equal(publicCode('startedAt must be a valid ISO date (YYYY-MM-DD)'), 'X_MUST_BE_A_VALID_ISO_DATE_YYYY_MM_DD');
  assert.equal(publicCode('relation "plugin_x" does not exist'), null, 'database errors stay private');
});

// The school's university result sheet (Result.xlsx 2025-2026): ten subjects (five a semester, out of 100),
// with the sheet's own totals, averages, grades, GPA and ranks.
test('university results match the school\'s university result sheet', () => {
  const U = require(path.join(root, 'ui', 'university-math.js'));
  const rows = [
    [[70.5, 54.5, 69, 79.5, 86, 0, 4, 0, 0, 29], 392.5, 39.25, 'F', 1.75, 28],
    [[87, 72, 95, 76.5, 96, 90, 69.5, 89, 77, 84.5], 836.5, 83.65, 'B+', 3.75, 5],
    [[78.5, 59, 84.5, 63.5, 91.5, 82, 52.5, 80, 51.5, 52.5], 695.5, 69.55, 'C+', 3, 17],
    [[90, 68.5, 98, 78, 97, 99, 84.5, 95, 66.5, 90], 866.5, 86.65, 'A', 4, 2],
    [[97, 64, 66, 76, 95.5, 98.5, 51, 56.5, 73.5, 90], 768, 76.8, 'B', 3.5, 12],
    [[89, 74, 83.5, 73, 93, 88.5, 88, 86.5, 70, 84], 829.5, 82.95, 'B+', 3.75, 6],
    [[52, 55, 72.5, 52, 57, 23, 2.5, 17, 3, 0], 334, 33.4, 'F', 1.75, 30],
    [[59.5, 54.5, 74.5, 79, 90.5, 21, 2.5, 29, 2.5, 29], 442, 44.2, 'E', 2, 23],
    [[63, 81.5, 93, 76.5, 91, 54, 52, 79, 67, 86], 743, 74.3, 'B', 3.5, 14],
    [[59.5, 75.5, 82.5, 51, 92, 29, 7, 32.5, 4, 29], 462, 46.2, 'D', 2.25, 22],
    [[54, 62, 83, 63, 92, 53.5, 54.5, 82.5, 51, 85.5], 681, 68.1, 'C+', 3, 18],
    [[52, 51, 52, 51, 72, 24, 0, 17, 0.5, 0.5], 320, 32, 'F', 1.75, 31],
    [[72, 79.5, 97, 66, 94, 64, 77, 82, 54, 90], 775.5, 77.55, 'B', 3.5, 11],
    [[53, 54, 64, 52, 90, 28.5, 2.5, 23, 2, 26.5], 395.5, 39.55, 'F', 1.75, 27],
    [[62, 53, 81, 51, 52, 26.5, 3, 19.5, 1.5, 0], 349.5, 34.95, 'F', 1.75, 29],
    [[93, 85, 95, 66.5, 93, 88.5, 87, 82, 68, 84.5], 842.5, 84.25, 'B+', 3.75, 3],
    [[85.5, 64, 86, 70, 93, 23.5, 1, 4, 2.5, 3.5], 433, 43.3, 'E', 2, 24],
    [[95, 69.5, 65, 60, 96, 66.5, 85.5, 84, 54.5, 88], 764, 76.4, 'B', 3.5, 13],
    [[90.5, 77, 93, 60, 93, 69, 91, 78, 53, 89.5], 794, 79.4, 'B', 3.5, 8],
    [[48.5, 59, 89, 64, 73, 66.5, 87.5, 82.5, 36.5, 71.5], 678, 67.8, 'C+', 3, 19],
    [[74, 78.5, 85.5, 70, 91.5, 76, 81, 81, 68, 82], 787.5, 78.75, 'B', 3.5, 10],
    [[80, 69, 96, 73, 93, 55, 86, 84.5, 67, 90.5], 794, 79.4, 'B', 3.5, 8],
    [[91, 90.5, 97.5, 71, 97, 25, 3, 31, 4.5, 27.5], 538, 53.8, 'C', 2.5, 21],
    [[96, 86.5, 98.5, 75, 96, 26, 3, 31, 4.5, 27.5], 544, 54.4, 'C', 2.5, 20],
    [[95, 71, 91, 79, 96, 70.5, 85.5, 93, 68, 91], 840, 84, 'B+', 3.75, 4],
    [[52, 52, 65, 55.5, 77.5, 20, 8.5, 38, 1.5, 32], 402, 40.2, 'E', 2, 26],
    [[82.5, 64.5, 67.5, 86, 94.5, 94.5, 83, 94, 56, 90.5], 813, 81.3, 'B+', 3.75, 7],
    [[77.5, 72, 77, 73.5, 91, 56, 71.5, 56, 51, 78], 703.5, 70.35, 'B', 3.5, 16],
    [[63, 52, 80.5, 67.5, 79.5, 28.5, 4.5, 28.5, 2.5, 25.5], 432, 43.2, 'E', 2, 25],
    [[100, 83, 95, 80.5, 96, 100, 80, 86.5, 58.5, 92], 871.5, 87.15, 'A', 4, 1],
    [[92, 67, 74, 61.5, 87.5, 67, 82, 72.5, 54.5, 78.5], 736.5, 73.65, 'B', 3.5, 15],
  ];
  const semesters = [{ id: 's1' }, { id: 's2' }];
  const subjects = Array.from({ length: 10 }, (_, i) => ({ id: 'u' + i, tabId: i < 5 ? 's1' : 's2', maxScore: 100 }));
  const students = rows.map((_, i) => ({ id: 'st' + i }));
  const scores = { s1: {}, s2: {} };
  rows.forEach(([marks], i) => marks.forEach((mark, j) => { ((scores[j < 5 ? 's1' : 's2'])['st' + i] ||= {})['u' + j] = mark; }));
  const out = U.results({ semesters, subjects, students }, scores);
  rows.forEach(([, total, average, grade, gpa, rank], i) => {
    assert.deepEqual([out['st' + i].total, out['st' + i].average, out['st' + i].grade, out['st' + i].gpa, out['st' + i].rank], [total, average, grade, gpa, rank], 'student ' + (i + 1));
  });
  // subject letters, as on the sheet
  for (const [score, letter] of [[100, 'A'], [85, 'A'], [84.5, 'B+'], [80, 'B+'], [79.5, 'B'], [70, 'B'], [69.5, 'C+'], [65, 'C+'], [64, 'C'], [50, 'C'], [48.5, 'D'], [45, 'D'], [44, 'E'], [40, 'E'], [36.5, 'F'], [0, 'F']]) {
    assert.equal(U.letter(score, 100, U.SCALE), letter, String(score));
  }
  assert.equal(U.letter(null, 100), '');
  assert.equal(U.letter(42.5, 50), 'A', 'a share of the subject\'s maximum');
  // each semester's own total, grade, GPA and rank (ranked by the semester's total)
  const s1 = rows.map((r, i) => ({ id: 'st' + i, value: r[0].slice(0, 5).reduce((x, y) => x + y, 0) }));
  const best = s1.slice().sort((x, y) => y.value - x.value)[0];
  assert.equal(out[best.id].semesters.s1.rank, 1);
  assert.equal(out.st0.semesters.s1.total, 359.5); assert.equal(out.st0.semesters.s1.average, 71.9); assert.equal(out.st0.semesters.s1.grade, 'B'); assert.equal(out.st0.semesters.s1.gpa, 3.5);
  assert.equal(out.st0.semesters.s2.total, 33); assert.equal(out.st0.semesters.s2.grade, 'F');
  // no score at all: no total, no rank
  const empty = U.results({ semesters, subjects, students: [{ id: 'x' }] }, {});
  assert.deepEqual([empty.x.total, empty.x.average, empty.x.grade, empty.x.rank], [null, null, '', null]);
  // the backend's default scale is the screen's
  assert.deepEqual(require(path.join(root, 'backend', 'transcripts.js')).UNIVERSITY_SCALE, U.SCALE);
});
