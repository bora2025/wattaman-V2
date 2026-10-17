'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const registerPayroll = require('../backend/payroll');
const registerWorkforce = require('../backend/workforce');
const registerAttendance = require('../backend/attendance-secure');
const registerReports = require('../backend/reports');
const registerIdCards = require('../backend/id-cards');

function harness(database) {
  const routes = new Map();
  const context = {
    database,
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route.handler); } },
    navigation: { register() {} },
    permissions: { register() {} },
  };
  return { context, routes };
}

test('permission requester cannot approve their own request', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }), transaction: async callback => callback({ query: async () => [{ status: 'PENDING', requestedById: 'user-1' }], execute: async () => ({ count: 1 }) }) };
  const { context, routes } = harness(database); registerPayroll(context);
  await assert.rejects(routes.get('PUT permissions/:id')({ params: { id: 'permission-1' }, principal: { userId: 'user-1' }, body: { status: 'APPROVED' } }), /requester cannot approve/i);
});

test('payroll creator cannot approve their own payroll', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }), transaction: async callback => callback({ query: async () => [{ status: 'DRAFT', createdById: 'maker-1', approvedById: null }], execute: async () => ({ count: 1 }) }) };
  const { context, routes } = harness(database); registerPayroll(context);
  await assert.rejects(routes.get('PUT payroll/:id')({ params: { id: 'payroll-1' }, principal: { userId: 'maker-1' }, body: { status: 'APPROVED' } }), /creator cannot approve/i);
});

test('payroll approver cannot mark their own approval paid', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }), transaction: async callback => callback({ query: async () => [{ status: 'APPROVED', createdById: 'maker-1', approvedById: 'approver-1' }], execute: async () => ({ count: 1 }) }) };
  const { context, routes } = harness(database); registerPayroll(context);
  await assert.rejects(routes.get('PUT payroll/:id')({ params: { id: 'payroll-1' }, principal: { userId: 'approver-1' }, body: { status: 'PAID' } }), /approver cannot mark/i);
});

test('payroll calculation returns the authoritative stored row after database triggers', async () => {
  const authoritative = { id: 'payroll-1', employeeId: 'employee-1', attendanceDays: 2, presentDays: 1, absentDays: 1, netPayMinor: 50000 };
  const database = {
    query: async sql => {
      if (sql.includes('FROM plugin_wattanam_organizing_management_employee')) return [{ id: 'employee-1', baseSalaryMinor: 100000, salaryCurrency: 'USD', salaryBasis: 'MONTHLY' }];
      if (sql.includes('COUNT(*)::int AS "attendanceDays"')) return [{ attendanceDays: 1, presentDays: 1, lateDays: 0, absentDays: 0, leaveDays: 0, workedHours: 8 }];
      if (sql.includes('FROM plugin_wattanam_organizing_management_compensation_adjustment')) return [];
      if (sql.includes('FROM plugin_wattanam_organizing_management_payroll_record WHERE')) return [authoritative];
      return [];
    },
    execute: async () => ({ count: 1 }),
    transaction: async callback => callback(database),
  };
  const { context, routes } = harness(database); registerPayroll(context);
  const result = await routes.get('POST payroll/calculate')({ principal: { userId: 'maker-1' }, body: { employeeId: 'employee-1', periodStart: '2026-10-17', periodEnd: '2026-10-18' } });
  assert.deepEqual(result, authoritative);
});

test('day-off requester cannot approve their own request', async () => {
  const database = { transaction: async callback => callback({ query: async () => [{ status: 'PENDING', requestedById: 'user-1' }], execute: async () => ({ count: 1 }) }) };
  const { context, routes } = harness(database); registerWorkforce(context);
  await assert.rejects(routes.get('PUT day-off/:id')({ params: { id: 'leave-1' }, principal: { userId: 'user-1' }, body: { status: 'APPROVED' } }), /requester cannot approve/i);
});

test('attendance correction writes immutable audit before updating record', async () => {
  const calls = [];
  const tx = { query: async () => [{ id: 'attendance-1', employeeId: 'employee-1', status: 'LATE', checkInAt: '2026-10-17T01:20:00.000Z', checkOutAt: null }], execute: async (sql, params) => { calls.push({ sql, params }); return { count: 1 }; } };
  const database = { transaction: async callback => callback(tx), query: tx.query, execute: tx.execute };
  const { context, routes } = harness(database); registerAttendance(context);
  const result = await routes.get('PUT attendance/records/:id')({ params: { id: 'attendance-1' }, principal: { userId: 'manager-1' }, body: { status: 'PRESENT', checkInAt: '2026-10-17T01:00:00.000Z', checkOutAt: '2026-10-17T09:00:00.000Z', reason: 'Approved clock correction' } });
  assert.equal(result.saved, true);
  assert.match(calls[0].sql, /attendance_correction/);
  assert.match(calls[1].sql, /source"='CORRECTION'/);
  assert.equal(calls[0].params.at(-1), 'manager-1');
});

test('organization settings reject invalid timezone identifiers', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }) };
  const { context, routes } = harness(database); registerWorkforce(context);
  await assert.rejects(routes.get('PUT organization')({ body: { name: 'Example', organizationType: 'COMPANY', timezone: 'Mars/Olympus' } }), /valid IANA timezone/i);
});

test('employee creation does not persist an unknown optional position foreign key', async () => {
  let inserted;
  const database = { query: async () => [], execute: async (_sql, params) => { inserted = params; return { count: 1 }; } };
  const { context, routes } = harness(database); registerWorkforce(context);
  const result = await routes.get('POST employees')({ body: { employeeNumber: 'EMP-1', fullName: 'Example Person', employmentType: 'EMPLOYEE', employmentStatus: 'ACTIVE', positionId: 'Manager', position: 'Manager' } });
  assert.equal(result.employeeNumber, 'EMP-1');
  assert.equal(inserted[5], null);
  assert.equal(inserted[6], 'Manager');
});

test('attendance reports reject reversed date ranges', async () => {
  const database = { query: async () => [] };
  const { context, routes } = harness(database); registerReports(context);
  await assert.rejects(routes.get('GET reports/attendance')({ query: { from: '2026-10-31', to: '2026-10-01' } }), /end date must be on or after/i);
});

test('attendance reports require a bounded period and count no-scan workdays', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }) };
  const { context, routes } = harness(database); registerReports(context);
  const report = routes.get('GET reports/attendance');
  await assert.rejects(() => report({ query: {} }), /requires both from and to dates/);
  database.query = async (sql) => {
    assert.match(sql, /generate_series/);
    assert.match(sql, /status IS NULL AND NOT approved_leave AND NOT approved_permission/);
    assert.match(sql, /eventType"='HOLIDAY'/);
    return [];
  };
  await report({ query: { from: '2026-10-01', to: '2026-10-31' } });
});

test('ID card templates reject insecure remote logo URLs', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }) };
  const { context, routes } = harness(database); registerIdCards(context);
  await assert.rejects(routes.get('PUT id-card-template/:type')({ params: { type: 'staff' }, principal: { userId: 'manager-1' }, body: { schoolName: 'Example', cardTitle: 'Staff ID', logoUrl: 'http://example.test/logo.png', cardSize: 'cr80-portrait', designPreset: 'staff-geometric-mint', primaryColor: '#164e3f', accentColor: '#3b9478' } }), /HTTPS image URL/i);
});

test('attendance settings reject impossible clock values and ordering', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }) };
  const { context, routes } = harness(database); registerAttendance(context);
  const save = routes.get('PUT attendance-settings');
  await assert.rejects(save({ body: { workDays: [1,2,3,4,5], checkInTime: '99:00', lateAfterTime: '08:15', checkOutTime: '17:00', minimumCheckoutMinutes: 30, maximumOfflineMinutes: 15 } }), /valid 24-hour time/i);
  await assert.rejects(save({ body: { workDays: [1,2,3,4,5], checkInTime: '09:00', lateAfterTime: '08:15', checkOutTime: '17:00', minimumCheckoutMinutes: 30, maximumOfflineMinutes: 15 } }), /must progress/i);
});

test('calendar update stores a before-change audit snapshot', async () => {
  const calls = [];
  const tx = { query: async () => [{ id: 'event-1', title: 'Old title', eventType: 'EVENT' }], execute: async (sql, params) => { calls.push({ sql, params }); return { count: 1 }; } };
  const database = { transaction: async callback => callback(tx), query: tx.query, execute: tx.execute };
  const { context, routes } = harness(database); registerWorkforce(context);
  const result = await routes.get('PUT calendar/:id')({ params: { id: 'event-1' }, principal: { userId: 'manager-1' }, body: { title: 'Updated title', eventType: 'MEETING', startsAt: '2026-10-20T09:00:00.000Z', endsAt: '2026-10-20T10:00:00.000Z', allDay: false } });
  assert.equal(result.title, 'Updated title');
  assert.match(calls[0].sql, /calendar_audit/);
  assert.match(calls[0].params[2], /Old title/);
  assert.match(calls[1].sql, /UPDATE plugin_wattanam_organizing_management_calendar_event/);
});

test('general workforce directory does not expose QR or sensitive profile fields', async () => {
  let sql = '';
  const database = { query: async value => { sql = value; return []; }, execute: async () => ({ count: 1 }) };
  const { context, routes } = harness(database); registerWorkforce(context);
  await routes.get('GET employees')({ query: {} });
  assert.doesNotMatch(sql, /qrIdentifier/);
  assert.doesNotMatch(sql, /nationalId/);
  assert.doesNotMatch(sql, /emergencyContact/);
});

test('workforce profiles reject malformed email and insecure photo URLs', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }) };
  const { context, routes } = harness(database); registerReports(context);
  const base = { employeeNumber:'EMP-1', fullName:'Example Person', phone:'', positionId:'', position:'', department:'', employmentType:'EMPLOYEE', employmentStatus:'ACTIVE', startDate:'', dateOfBirth:'', gender:'', nationalId:'', address:'', emergencyContactName:'', emergencyContactPhone:'', notes:'' };
  await assert.rejects(routes.get('PUT workforce-profiles/:id')({ params:{id:'employee-1'}, body:{...base,email:'not-an-email',photoUrl:''} }), /email is invalid/i);
  await assert.rejects(routes.get('PUT workforce-profiles/:id')({ params:{id:'employee-1'}, body:{...base,email:'person@example.com',photoUrl:'http://example.test/photo.png'} }), /HTTPS image URL/i);
});
