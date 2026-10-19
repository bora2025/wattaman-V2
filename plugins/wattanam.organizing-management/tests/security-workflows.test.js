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

test('salary terms accept the visible workforce number and update the internal employee id', async () => {
  let updateParams = [];
  const database = {
    query: async (sql, params) => {
      assert.match(sql, /"id"=\$1 OR "employeeNumber"=\$1/);
      assert.deepEqual(params, ['001']);
      return [{ id: 'employee-internal-id' }];
    },
    execute: async (sql, params) => { updateParams = params; return { count: 1 }; },
    transaction: async callback => callback(database),
  };
  const { context, routes } = harness(database); registerPayroll(context);
  const result = await routes.get('PUT salary/:employeeId')({ params: { employeeId: '001' }, body: { baseSalary: 500, salaryCurrency: 'USD', salaryBasis: 'MONTHLY' } });
  assert.equal(result.id, 'employee-internal-id');
  assert.equal(result.baseSalary, 500);
  assert.deepEqual(updateParams, ['employee-internal-id', 50000, 'USD', 'MONTHLY']);
});

test('salary terms can be removed without deleting workforce or payroll history', async () => {
  const calls=[];
  const database={query:async()=>[{id:'employee-internal'}],execute:async(sql,params)=>{calls.push({sql,params});return{count:1};},transaction:async callback=>callback(database)};
  const {context,routes}=harness(database);registerPayroll(context);
  const result=await routes.get('DELETE salary/:employeeId')({params:{employeeId:'001'}});
  assert.deepEqual(result,{id:'employee-internal',deleted:true});
  assert.match(calls[0].sql,/"salaryConfigured"=FALSE/);
  assert.doesNotMatch(calls[0].sql,/DELETE FROM/);
});

test('payroll calculation requires configured salary terms', async () => {
  const database={query:async()=>[{id:'employee-1',baseSalaryMinor:0,salaryCurrency:'USD',salaryBasis:'MONTHLY',salaryConfigured:false}],execute:async()=>({count:1}),transaction:async callback=>callback(database)};
  const {context,routes}=harness(database);registerPayroll(context);
  await assert.rejects(routes.get('POST payroll/calculate')({principal:{userId:'manager-1'},body:{employeeId:'001',periodStart:'2026-10-01',periodEnd:'2026-10-31'}}),/must be configured/);
});

test('payroll calculation returns the authoritative stored row after database triggers', async () => {
  const authoritative = { id: 'payroll-1', employeeId: 'employee-1', attendanceDays: 2, presentDays: 1, absentDays: 1, netPayMinor: 50000 };
  let insertParams = [];
  const database = {
    query: async sql => {
      if (sql.includes('FROM plugin_wattanam_organizing_management_employee')) return [{ id: 'employee-1', baseSalaryMinor: 100000, salaryCurrency: 'USD', salaryBasis: 'MONTHLY', salaryConfigured: true }];
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
  assert.equal(result.netPayMinor, 50000);
  assert.equal(result.netPay, 500);
  assert.equal(insertParams[14], 10000);
  assert.equal(insertParams[15], 5000);
  assert.equal(insertParams[24], 3000);
  assert.equal(insertParams[25], 2000);
  assert.match(insertParams[28], /"formula":"grossPay-\(totalDeductions\+totalTaxes\)"/);
});

test('salary directory and detail expose normal currency amounts for editing', async () => {
  const row = { id:'employee-1', employeeNumber:'001', fullName:'Bora', baseSalaryMinor:50000, salaryCurrency:'USD', salaryBasis:'MONTHLY' };
  const database = { query: async () => [row], execute: async () => ({ count:1 }), transaction: async callback => callback(database) };
  const { context, routes } = harness(database); registerPayroll(context);
  const list = await routes.get('GET salaries')({});
  const detail = await routes.get('GET salary/:employeeId')({ params:{ employeeId:'001' } });
  assert.equal(list[0].baseSalary, 500);
  assert.equal(detail.baseSalary, 500);
});

test('draft payroll edits recalculate totals and retain an audit snapshot', async () => {
  const calls = [];
  const current = { id:'payroll-1', status:'DRAFT', basePayMinor:50000, earningsMinor:2500, attendanceDeductionMinor:1000, deductionsMinor:500, calculation:{ salaryBasis:'MONTHLY' }, allowancesMinor:0, overtimePayMinor:0, bonusesMinor:0, reimbursementsMinor:0, leaveAdjustmentMinor:0, retirementContributionMinor:0, insurancePremiumMinor:0, loanRecoveryMinor:0, lossOfPayMinor:0, otherPostTaxDeductionMinor:0, incomeTaxMinor:0, socialSecurityMinor:0, localTaxMinor:0, grossPayMinor:52500, totalDeductionsMinor:1500, totalTaxesMinor:0, netPayMinor:51000 };
  const saved = { ...current, allowancesMinor:10000, insurancePremiumMinor:2000, incomeTaxMinor:3000, grossPayMinor:62500, totalDeductionsMinor:3500, totalTaxesMinor:3000, netPayMinor:56000 };
  let queryCount = 0;
  const tx = { query: async () => (++queryCount === 1 ? [current] : [saved]), execute: async (sql, params) => { calls.push({ sql, params }); return { count:1 }; } };
  const database = { query: tx.query, execute: tx.execute, transaction: async callback => callback(tx) };
  const { context, routes } = harness(database); registerPayroll(context);
  const result = await routes.get('PUT payroll/:id/draft')({ params:{ id:'payroll-1' }, principal:{ userId:'manager-1' }, body:{ allowances:100, insurancePremium:20, incomeTax:30 } });
  assert.equal(result.grossPay, 625);
  assert.equal(result.netPay, 560);
  assert.equal(calls[0].params[1], 10000);
  assert.equal(calls[0].params[7], 2000);
  assert.equal(calls[0].params[11], 3000);
  assert.match(calls[1].sql, /payroll_audit/);
  assert.match(calls[1].params[3], /EDIT_DRAFT/);
});

test('approved payroll cannot be edited', async () => {
  const tx = { query: async () => [{ id:'payroll-1', status:'APPROVED' }], execute: async () => ({ count:1 }) };
  const database = { query:tx.query, execute:tx.execute, transaction:async callback => callback(tx) };
  const { context, routes } = harness(database); registerPayroll(context);
  await assert.rejects(routes.get('PUT payroll/:id/draft')({ params:{id:'payroll-1'}, principal:{userId:'manager-1'}, body:{} }), /Only draft payroll can be edited/);
});

test('pristine draft payroll can be deleted', async () => {
  const calls=[];
  const tx={query:async sql=>sql.includes('FOR UPDATE')?[{id:'payroll-1',status:'DRAFT'}]:[{count:0}],execute:async(sql,params)=>{calls.push({sql,params});return{count:1};}};
  const database={query:tx.query,execute:tx.execute,transaction:async callback=>callback(tx)};
  const {context,routes}=harness(database);registerPayroll(context);
  const result=await routes.get('DELETE payroll/:id')({params:{id:'payroll-1'}});
  assert.deepEqual(result,{id:'payroll-1',deleted:true});
  assert.match(calls[0].sql,/"status"='DRAFT'/);
});

test('payroll with a final status or audit history cannot be deleted', async () => {
  const approvedTx={query:async()=>[{id:'payroll-1',status:'APPROVED'}],execute:async()=>({count:1})};
  let database={query:approvedTx.query,execute:approvedTx.execute,transaction:async callback=>callback(approvedTx)};
  let setup=harness(database);registerPayroll(setup.context);
  await assert.rejects(setup.routes.get('DELETE payroll/:id')({params:{id:'payroll-1'}}),/Only draft payroll/);
  const editedTx={query:async sql=>sql.includes('FOR UPDATE')?[{id:'payroll-2',status:'DRAFT'}]:[{count:1}],execute:async()=>({count:1})};
  database={query:editedTx.query,execute:editedTx.execute,transaction:async callback=>callback(editedTx)};
  setup=harness(database);registerPayroll(setup.context);
  await assert.rejects(setup.routes.get('DELETE payroll/:id')({params:{id:'payroll-2'}}),/audit history/);
});

test('payroll types store reusable defaults in minor units and expose normal amounts', async () => {
  let insertParams=[];
  const database={query:async()=>[],execute:async(_sql,params)=>{insertParams=params;return{count:1};},transaction:async callback=>callback(database)};
  const {context,routes}=harness(database);registerPayroll(context);
  const result=await routes.get('POST payroll-types')({principal:{userId:'manager-1'},body:{code:'staff',name:'Staff',allowances:100,overtimePay:25.5,bonuses:50,active:true}});
  assert.equal(result.code,'STAFF');
  assert.equal(result.allowances,100);
  assert.equal(insertParams[4],10000);
  assert.equal(insertParams[5],2550);
  assert.equal(insertParams[6],5000);
});

test('unused payroll types can be deleted without breaking payroll audit history', async () => {
  const calls=[];
  const tx={query:async sql=>sql.includes('FOR UPDATE')?[{id:'type-1',name:'Temporary'}]:[{memberCount:0,payrollCount:0}],execute:async(sql,params)=>{calls.push({sql,params});return{count:1};}};
  const database={query:tx.query,execute:tx.execute,transaction:async callback=>callback(tx)};
  const {context,routes}=harness(database);registerPayroll(context);
  const result=await routes.get('DELETE payroll-types/:id')({params:{id:'type-1'}});
  assert.deepEqual(result,{id:'type-1',name:'Temporary',deleted:true});
  assert.match(calls[0].sql,/DELETE FROM plugin_wattanam_organizing_management_payroll_type/);
});

test('payroll types in use must be deactivated instead of deleted', async () => {
  const tx={query:async sql=>sql.includes('FOR UPDATE')?[{id:'type-1',name:'Staff'}]:[{memberCount:1,payrollCount:2}],execute:async()=>({count:1})};
  const database={query:tx.query,execute:tx.execute,transaction:async callback=>callback(tx)};
  const {context,routes}=harness(database);registerPayroll(context);
  await assert.rejects(routes.get('DELETE payroll-types/:id')({params:{id:'type-1'}}),/Deactivate it instead/);
});

test('payroll type assignment resolves the visible workforce number', async () => {
  const calls=[];
  const database={query:async(sql)=>sql.includes('employeeNumber')?[{id:'employee-internal'}]:[{id:'type-1',name:'Staff'}],execute:async(sql,params)=>{calls.push({sql,params});return{count:1};},transaction:async callback=>callback(database)};
  const {context,routes}=harness(database);registerPayroll(context);
  const result=await routes.get('PUT payroll-assignment/:employeeId')({params:{employeeId:'001'},body:{payrollTypeId:'type-1'}});
  assert.equal(result.employeeId,'employee-internal');
  assert.deepEqual(calls[0].params,['employee-internal','type-1']);
});

test('batch payroll creates only missing drafts and never overwrites existing payroll', async () => {
  const type={id:'type-1',name:'Staff',allowancesMinor:10000,overtimePayMinor:2500};
  let queryCount=0,insert;
  const database={query:async()=>++queryCount===1?[type]:[{id:'employee-1',salaryCurrency:'USD',earningsMinor:5000,deductionsMinor:1000}],execute:async(sql,params)=>{insert={sql,params};return{count:1};},transaction:async callback=>callback(database)};
  const {context,routes}=harness(database);registerPayroll(context);
  const result=await routes.get('POST payroll/batch')({principal:{userId:'manager-1'},body:{payrollTypeId:'type-1',periodStart:'2026-10-01',periodEnd:'2026-10-31'}});
  assert.equal(result.created,1);
  assert.match(insert.sql,/ON CONFLICT \("employeeId","periodStart","periodEnd"\) DO NOTHING/);
  const payload=JSON.parse(insert.params[0]);
  assert.equal(payload[0].allowancesMinor,10000);
  assert.equal(payload[0].overtimePayMinor,2500);
  assert.equal(payload[0].earningsMinor,5000);
});

test('payroll UI exposes an audit-ready register and individual payslip', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'page.json'), 'utf8')).pages;
  const payroll = pages.find(page => page.id === 'payroll');
  const review = pages.find(page => page.id === 'payroll-review');
  const calculate = payroll.components.find(component => component.id === 'calculate');
  const fieldIds = new Set(calculate.fields.map(field => field.id));
  for (const field of ['allowances','overtimePay','bonuses','reimbursements','retirementContribution','insurancePremium','loanRecovery','lossOfPay','incomeTax','socialSecurity','localTax']) assert.ok(fieldIds.has(field), `missing payroll input ${field}`);
  assert.ok(calculate.fields.every(field => !field.id.endsWith('Minor')), 'payroll form must use normal currency amounts');
  assert.deepEqual(payroll.components.find(component => component.id === 'export').options.formats, ['print','xlsx']);
  const payrollList=payroll.components.find(component => component.id === 'list');
  assert.equal(payrollList.options.selectable, false);
  const payrollDelete=payrollList.options.rowActions[0];
  assert.deepEqual({source:payrollDelete.source,idField:payrollDelete.idField,idParameter:payrollDelete.idParameter,destructive:payrollDelete.destructive},{source:'removePayroll',idField:'id',idParameter:'id',destructive:true});
  const salaryList=payroll.components.find(component => component.id === 'salaries');
  assert.equal(salaryList.options.selectable, false);
  const salaryDelete=salaryList.options.rowActions[0];
  assert.deepEqual({source:salaryDelete.source,idField:salaryDelete.idField,idParameter:salaryDelete.idParameter,destructive:salaryDelete.destructive},{source:'removeSalary',idField:'id',idParameter:'employeeId',destructive:true});
  assert.deepEqual(review.components.find(component => component.id === 'payslip').options.formats, ['print','pdf','xlsx']);
  assert.equal(payroll.components.find(component => component.id === 'salaries').options.rowRoute, 'salary/:employeeId');
  assert.equal(review.components.find(component => component.id === 'editDraft').initialSource, 'record');
  assert.equal(pages.find(page => page.id === 'salary-edit').components.find(component => component.id === 'save').initialSource, 'record');
  const types=pages.find(page=>page.id==='payroll-types');
  assert.equal(types.components.find(component=>component.id==='list').options.rowRoute,'payroll-types/:id');
  const typeList=types.components.find(component=>component.id==='list');
  assert.equal(typeList.options.selectable,false);
  const deleteAction=typeList.options.rowActions[0];
  assert.deepEqual({source:deleteAction.source,idField:deleteAction.idField,idParameter:deleteAction.idParameter,destructive:deleteAction.destructive},{source:'remove',idField:'id',idParameter:'id',destructive:true});
  assert.match(types.components.find(component=>component.id==='batch').options.confirmation,/will not be changed/i);
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
    [{ id:'employee-1', fullName:'Example Person', employeeNumber:'EMP-1', positionTitle:'Manager', department:'Operations', qrIdentifier:'secure-qr', baseSalaryMinor:50000 }],
    [{ id:'reward-1', adjustmentType:'GOOD_JOB_REWARD', amountMinor:2500 }, { id:'deduction-1', adjustmentType:'WAGE_DEDUCTION', amountMinor:1000 }],
    [{ id:'permission-1', status:'APPROVED' }],
    [{ id:'discipline-1', status:'CLOSED' }],
    [{ id:'promotion-1', toPosition:'Manager', previousBaseSalaryMinor:45000, newBaseSalaryMinor:50000 }],
    [{ id:'payroll-1', status:'PAID', basePayMinor:50000, earningsMinor:2500, deductionsMinor:1000, attendanceDeductionMinor:0, netPayMinor:51500 }],
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
  assert.equal(result.employee.baseSalary, 500);
  assert.equal(result.rewards[0].amount, 25);
  assert.equal(result.promotions[0].newBaseSalary, 500);
  assert.equal(result.payroll[0].netPay, 515);
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

test('mutable workforce modules expose guarded delete or archive routes', async () => {
  const database = { query: async () => [], execute: async () => ({ count: 1 }), transaction: async callback => callback({ query: async () => [], execute: async () => ({ count: 1 }) }) };
  const { context, routes } = harness(database); registerWorkforce(context); registerPayroll(context);
  for (const route of ['DELETE positions/:id','DELETE employees/:id','DELETE calendar/:id','GET compensation/:id','PUT compensation/:id','DELETE compensation/:id']) assert.equal(typeof routes.get(route), 'function', `${route} should be registered`);
});

test('CRUD list pages provide clickable edit rows and guarded per-record actions', () => {
  const ui = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'page.json'), 'utf8'));
  for (const pageId of ['positions','employees','hr-calendar','compensation']) {
    const page = ui.pages.find(item => item.id === pageId), table = page.components.find(item => item.id === 'list');
    assert.equal(table.options.selectable, false, `${pageId} should not require bulk selection`);
    assert.equal(table.options.rowClickable, true, `${pageId} should open its edit or profile view`);
    assert.ok(table.options.rowActions?.some(action => action.destructive), `${pageId} should expose a guarded remove/archive action in each row`);
    assert.equal(page.components.some(item => item.type === 'actions'), false, `${pageId} should not show a detached action card`);
  }
  assert.ok(ui.pages.some(page => page.id === 'compensation-edit'));
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
