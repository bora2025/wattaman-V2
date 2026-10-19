'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registerPayroll = require('../backend/payroll');
const registerWorkforce = require('../backend/workforce');
const registerAttendance = require('../backend/attendance-secure');
const registerReports = require('../backend/reports');
const registerIdCards = require('../backend/id-cards');
const registerEmployeeRelations = require('../backend/employee-relations');

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
  let insertParams = [];
  const database = {
    query: async sql => {
      if (sql.includes('FROM plugin_wattanam_organizing_management_employee')) return [{ id: 'employee-1', baseSalaryMinor: 100000, salaryCurrency: 'USD', salaryBasis: 'MONTHLY' }];
      if (sql.includes('COUNT(*)::int AS "attendanceDays"')) return [{ attendanceDays: 1, presentDays: 1, lateDays: 0, absentDays: 0, leaveDays: 0, workedHours: 8 }];
      if (sql.includes('FROM plugin_wattanam_organizing_management_compensation_adjustment')) return [];
      if (sql.includes('FROM plugin_wattanam_organizing_management_payroll_record WHERE')) return [authoritative];
      return [];
    },
    execute: async (sql, params) => { if (sql.includes('INSERT INTO plugin_wattanam_organizing_management_payroll_record')) insertParams = params; return { count: 1 }; },
    transaction: async callback => callback(database),
  };
  const { context, routes } = harness(database); registerPayroll(context);
  const result = await routes.get('POST payroll/calculate')({ principal: { userId: 'maker-1' }, body: { employeeId: 'employee-1', periodStart: '2026-10-17', periodEnd: '2026-10-18', allowancesMinor: 10000, overtimePayMinor: 5000, incomeTaxMinor: 3000, socialSecurityMinor: 2000 } });
  assert.deepEqual(result, authoritative);
  assert.equal(insertParams[14], 10000);
  assert.equal(insertParams[15], 5000);
  assert.equal(insertParams[24], 3000);
  assert.equal(insertParams[25], 2000);
  assert.match(insertParams[28], /"formula":"grossPay-\(totalDeductions\+totalTaxes\)"/);
});

test('payroll UI exposes an audit-ready register and individual payslip', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'page.json'), 'utf8')).pages;
  const payroll = pages.find(page => page.id === 'payroll');
  const review = pages.find(page => page.id === 'payroll-review');
  const calculate = payroll.components.find(component => component.id === 'calculate');
  const fieldIds = new Set(calculate.fields.map(field => field.id));
  for (const field of ['allowancesMinor','overtimePayMinor','bonusesMinor','reimbursementsMinor','retirementContributionMinor','insurancePremiumMinor','loanRecoveryMinor','lossOfPayMinor','incomeTaxMinor','socialSecurityMinor','localTaxMinor']) assert.ok(fieldIds.has(field), `missing payroll input ${field}`);
  assert.deepEqual(payroll.components.find(component => component.id === 'export').options.formats, ['print','xlsx']);
  assert.deepEqual(review.components.find(component => component.id === 'payslip').options.formats, ['print','pdf','xlsx']);
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

test('employee creation persists a complete profile without an unknown position foreign key', async () => {
  let inserted;
  const database = { query: async () => [], execute: async (_sql, params) => { inserted = params; return { count: 1 }; } };
  const { context, routes } = harness(database); registerWorkforce(context);
  const result = await routes.get('POST employees')({ body: { employeeNumber: 'EMP-1', fullName: 'Example Person', employmentType: 'EMPLOYEE', employmentStatus: 'ACTIVE', positionId: 'Manager', position: 'Manager', dateOfBirth: '1998-04-20', gender: 'FEMALE', nationalId: 'ID-100', address: 'Phnom Penh', emergencyContactName: 'Example Contact', emergencyContactPhone: '012345678', notes: 'Complete profile' } });
  assert.equal(result.employeeNumber, 'EMP-1');
  assert.equal(inserted[5], null);
  assert.equal(inserted[6], 'Manager');
  assert.equal(inserted[13], '1998-04-20');
  assert.deepEqual(inserted.slice(14, 20), ['FEMALE', 'ID-100', 'Phnom Penh', 'Example Contact', '012345678', 'Complete profile']);
  assert.equal(result.profileCreated, true);
});

test('employee and employer profile editor can update the complete workforce record', () => {
  const descriptor = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'page.json'), 'utf8'));
  const page = descriptor.pages.find(item => item.id === 'profile-edit');
  const save = page.dataSources.find(item => item.id === 'save');
  const form = page.components.find(item => item.id === 'save');
  const relations = page.dataSources.find(item => item.id === 'relations');
  const workspace = page.components.find(item => item.id === 'profile-workspace');
  assert.equal(save.method, 'PUT');
  assert.equal(save.path, 'employees/:id');
  assert.equal(relations.path, 'employees/:id/relations');
  assert.equal(workspace.type, 'profile-manager');
  assert.deepEqual(workspace.options, { relationsSource:'relations', saveSource:'save' });
  assert.deepEqual(form.fields.map(field => field.id), [
    'employmentType','employeeNumber','fullName','photoUrl','email','phone','positionId','position','department','startDate','employmentStatus',
    'dateOfBirth','gender','nationalId','address','emergencyContactName','emergencyContactPhone','notes',
  ]);
  assert.deepEqual(page.components.filter(component => ['id-card','salary','rewards','deductions','permissions','discipline','promotions','payroll-history'].includes(component.id)).map(component => component.title), [
    'Your ID Card','Salary & Employment','Rewards & Bonuses','Salary & Wage Deductions','Permissions & Leave',
    'Disciplinary Actions','Job Promotion History','Salary & Payroll History',
  ]);
});

test('workforce directory rows open the single unified HR lifecycle profile', () => {
  const descriptor = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'page.json'), 'utf8'));
  const directory = descriptor.pages.find(item => item.id === 'workforce-directory');
  const table = directory.components.find(item => item.id === 'profiles');
  assert.equal(table.options.rowClickable, true);
  assert.equal(table.options.rowActionLabel, 'Edit employee/employer HR lifecycle');
  assert.equal(table.options.rowRoute, 'profiles/:id');
  assert.equal(descriptor.pages.filter(item => item.routePath === 'profiles/:id').length, 1);
});

test('employers and employees page uses an expandable form with profile navigation and Excel/print export', () => {
  const descriptor = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'page.json'), 'utf8'));
  const page = descriptor.pages.find(item => item.id === 'employees');
  const create = page.components.find(item => item.id === 'create');
  const table = page.components.find(item => item.id === 'list');
  const exporter = page.components.find(item => item.id === 'export');
  assert.deepEqual([create.options.collapsible, create.options.defaultCollapsed, create.options.triggerLabel], [true, true, 'Add employer / employee']);
  assert.deepEqual([table.options.rowClickable, table.options.rowRoute], [true, 'profiles/:id']);
  assert.deepEqual(exporter.options.formats, ['print', 'xlsx']);
  assert.equal(exporter.options.showPreview, false);
});

test('employee relations profile separates rewards and deductions and includes HR history', async () => {
  const responses = [
    [{ id:'employee-1', fullName:'Example Person', employeeNumber:'EMP-1', positionTitle:'Manager', department:'Operations', qrIdentifier:'secure-qr' }],
    [{ id:'reward-1', adjustmentType:'GOOD_JOB_REWARD' }, { id:'deduction-1', adjustmentType:'WAGE_DEDUCTION' }],
    [{ id:'permission-1', status:'APPROVED' }],
    [{ id:'discipline-1', status:'CLOSED' }],
    [{ id:'promotion-1', toPosition:'Manager' }],
    [{ id:'payroll-1', status:'PAID' }],
  ];
  let call = 0;
  const database = { query: async () => responses[call++] };
  const { context, routes } = harness(database); registerEmployeeRelations(context);
  const result = await routes.get('GET employees/:id/relations')({ params:{ id:'employee-1' } });
  assert.equal(result.idCard.employeeNumber, 'EMP-1');
  assert.equal(result.rewards[0].id, 'reward-1');
  assert.equal(result.deductions[0].id, 'deduction-1');
  assert.equal(result.permissions[0].id, 'permission-1');
  assert.equal(result.disciplinaryActions[0].id, 'discipline-1');
  assert.equal(result.promotions[0].id, 'promotion-1');
  assert.equal(result.payroll[0].id, 'payroll-1');
});

test('workforce search returns a permission-scoped edit destination', async () => {
  const database = { query: async (sql, params) => {
    assert.match(sql, /POSITION\(LOWER\(\$1\)/);
    assert.deepEqual(params, ['bora']);
    return [{ id:'employee-1', employeeNumber:'EMP-1', fullName:'Bora Example', employmentType:'EMPLOYEE', employmentStatus:'ACTIVE', positionTitle:'Manager', department:'Operations' }];
  } };
  const { context, routes } = harness(database); registerWorkforce(context);
  const result = await routes.get('GET search')({ query:{q:'bora'} });
  assert.deepEqual(result, [{ id:'workforce:employee-1', title:'Bora Example', description:'EMPLOYEE • EMP-1 • Manager • Operations • ACTIVE', href:'/plugins/wattanam.organizing-management/profiles/employee-1' }]);
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
