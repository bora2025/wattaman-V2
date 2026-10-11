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
    },
  });
  return { handler: routes.get('POST student/self-scan').handler, token, claims, audits, records, now };
}

async function activate(directory = { lookupUsers: async () => [], resolveAudience: async () => [] }) {
  const routes = new Map();
  const permissions = [];
  const navigation = [];
  await plugin.activate({
    logger: { log() {} },
    database: { query: async () => [], execute: async () => ({ count: 1 }), transaction: async (work) => work({ query: async () => [], execute: async () => ({ count: 1 }), publish() {} }) },
    directory,
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); return () => {}; } },
    permissions: { register(items) { permissions.push(...items); return () => {}; } },
    navigation: { register(items) { navigation.push(...items); return () => {}; } },
    events: { publish() {}, subscribe() { return () => {}; } },
    notifications: { notifyInApp: async () => {}, sendEmail: async () => ({ sent: true }) },
    readModels: { read: async () => [], publish: async () => {} },
    crypto: { hashBcrypt: async (value) => `hash:${value}` },
    accounts: { createStaff: async (input) => ({ id: 'staff-user-1', name: input.name, email: input.email, phone: input.phone, role: input.role }), createStudent: async () => ({}), updateStudent: async () => ({}) },
  });
  return { routes, permissions, navigation };
}

test('Academic Management exposes administration and full attendance workflows', async () => {
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
    navigation.filter((item) => ['study-years', 'classes', 'officers', 'officer-attendance', 'attendance-records', 'attendance-scanner', 'attendance-reports'].includes(item.id)).map((item) => item.id),
    ['study-years', 'classes', 'officers', 'officer-attendance', 'attendance-records', 'attendance-scanner', 'attendance-reports'],
  );

  const ui = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'page.json'), 'utf8'));
  const dashboard = ui.pages.find((candidate) => candidate.id === 'attendance-dashboard');
  assert.ok(dashboard?.components.some((component) => component.type === 'attendance-dashboard'), 'missing dedicated Attendance Dashboard workspace');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  assert.equal(manifest.navigation[0]?.id, 'attendance-dashboard', 'Attendance Dashboard must be the first plugin menu item');
  for (const page of ['study-years', 'classes', 'officers', 'officer-edit', 'officer-attendance', 'attendance-records', 'attendance-scanner', 'attendance-corrections', 'attendance-reports', 'attendance-settings', 'attendance-windows', 'student-attendance-scan', 'attendance-self-review', 'staff-attendance-scanner', 'staff-attendance-reports']) {
    assert.ok(ui.pages.some((candidate) => candidate.id === page), `missing UI page ${page}`);
  }
  const studyYears = ui.pages.find((candidate) => candidate.id === 'study-years');
  assert.ok(studyYears.components.some((component) => component.type === 'study-year-manager'), 'missing dedicated Study Years workspace');
  const classes = ui.pages.find((candidate) => candidate.id === 'classes');
  assert.ok(classes.components.some((component) => component.type === 'class-manager'), 'missing dedicated Manage Classes workspace');
  const classManager = classes.components.find((component) => component.type === 'class-manager');
  assert.equal(classManager.options.createStudentSource, 'createClassStudent', 'class roster must support creating a student login and profile directly');
  assert.ok(classes.dataSources.some((source) => source.id === 'createClassStudent' && source.path === 'classes/:classId/students/create'), 'missing direct class student creation source');
  assert.ok(classes.dataSources.some((source) => source.id === 'bulkUploadClassStudents'), 'missing bounded class spreadsheet import source');
  const officers = ui.pages.find((candidate) => candidate.id === 'officers');
  assert.ok(officers.components.some((component) => component.type === 'officer-manager'), 'missing dedicated Manage Officers workspace');
  const settings = ui.pages.find((candidate) => candidate.id === 'attendance-settings');
  assert.ok(settings.components.some((component) => component.type === 'session-manager'), 'missing dedicated Session Time Settings workspace');
  const attendance = ui.pages.find((candidate) => candidate.id === 'attendance-records');
  assert.ok(attendance.components.some((component) => component.type === 'take-attendance'), 'missing dedicated Take Attendance workspace');
  assert.ok(attendance.dataSources.some((source) => source.id === 'classStudents' && source.autoload === false), 'missing runtime class roster source');
  const studentScanner = ui.pages.find((candidate) => candidate.id === 'student-attendance-scan');
  assert.ok(studentScanner?.components.some((component) => component.type === 'self-attendance-scanner'), 'student scanner must use the durable offline-first workspace');
  assert.ok(studentScanner?.dataSources.some((source) => source.id === 'selfScan' && source.path === 'student/self-scan'), 'student scanner must submit to the secure self-scan route');
  const attendanceWindows = ui.pages.find((candidate) => candidate.id === 'attendance-windows');
  assert.ok(attendanceWindows?.components.some((component) => component.type === 'attendance-window-manager'), 'missing rotating signed-QR attendance window workspace');
  assert.ok(attendanceWindows?.dataSources.some((source) => source.id === 'windowLive' && source.path === 'attendance-windows/:id/live'), 'attendance window workspace requires live confirmation data');
  const staffScanner = ui.pages.find((candidate) => candidate.id === 'staff-attendance-scanner');
  const staffScannerComponent = staffScanner?.components.find((component) => component.id === 'staff-scanner');
  assert.equal(staffScannerComponent?.options?.station, true, 'staff attendance must use the fullscreen attendance-station workflow');
  assert.equal(staffScannerComponent?.options?.autoLocation, true, 'staff attendance station must capture location automatically');
  for (const pageId of ['student-id-cards', 'staff-id-cards']) {
    const cards = ui.pages.find((candidate) => candidate.id === pageId);
    assert.ok(cards?.components.some((component) => component.type === 'id-card-manager'), `missing ${pageId} workspace`);
    assert.ok(navigation.some((entry) => entry.id === pageId), `missing runtime navigation for ${pageId}`);
  }
  for (const pageId of ['attendance-reports', 'staff-attendance-reports']) {
    const reports = ui.pages.find((candidate) => candidate.id === pageId);
    assert.ok(reports?.components.some((component) => component.type === 'attendance-report-manager'), `missing ${pageId} workspace`);
  }
  assert.ok(routes.has('POST id-cards/classes/:id/ensure'), 'missing student card identifier backfill route');
  assert.ok(routes.has('GET id-cards/staff'), 'missing staff card route');
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

