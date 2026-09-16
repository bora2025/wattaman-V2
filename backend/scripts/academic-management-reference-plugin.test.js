'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const plugin = require('../../plugins/wattanam.academic-management/backend/index.js');

const CLASS = 'plugin_wattanam_academic_management_class';
const REGISTRATION = 'plugin_wattanam_academic_management_class_registration';
const SETTINGS = 'plugin_wattanam_academic_management_class_registration_settings';
const FIELD = 'plugin_wattanam_academic_management_class_registration_field';

function json(relative) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', relative), 'utf8'));
}

async function activate(database = { query: async () => [], execute: async () => ({ count: 0 }) }, extras = {}) {
  const routes = [];
  const permissions = [];
  const navigation = [];
  await plugin.activate({
    logger: { log: () => undefined }, database,
    routes: { register: (value) => { routes.push(value); return () => undefined; } },
    permissions: { register: (value) => { permissions.push(...value); return () => undefined; } },
    navigation: { register: (value) => { navigation.push(...value); return () => undefined; } },
    events: { publish: (event, payload) => (extras.events || []).push({ event, payload }), subscribe: () => () => undefined },
    notifications: { notifyInApp: (to, message, type) => (extras.notifications || []).push({ to, message, type }), sendEmail: () => ({ sent: true }) },
    directory: { resolveAudience: () => [] },
    crypto: { hashBcrypt: async (plaintext) => `bcrypt:${plaintext}` },
  });
  return { routes, permissions, navigation };
}

test('registers the initial department routes, permissions, and navigation', async () => {
  const result = await activate();
  assert.deepEqual(result.routes.map((route) => `${route.method}:${route.path}`), [
    'GET:departments',
    'GET:study-years',
    'GET:study-years/current',
    'POST:study-years',
    'PUT:study-years/:id',
    'POST:study-years/:id/set-current',
    'DELETE:study-years/:id',
    'POST:classes',
    'PUT:classes/:id',
    'DELETE:classes/:id',
    'GET:classes',
    'POST:classes/:id/students',
    'PATCH:classes/:classId/students/:studentId',
    'DELETE:classes/:id/students/:studentId',
    'POST:classes/cleanup-orphaned-students',
    'GET:admissions/public/classes',
    'GET:admissions/public/form-config',
    'GET:admissions/settings',
    'GET:admissions/fields',
    'PATCH:admissions/settings',
    'POST:admissions/fields',
    'PATCH:admissions/fields/:id',
    'POST:admissions/fields/reorder',
    'DELETE:admissions/fields/:id',
    'POST:admissions/public/submit',
    'PATCH:admissions/registrations/:id/resolve',
  ]);
  assert.deepEqual(result.permissions.map((permission) => permission.id), [
    'wattanam.academic-management.view', 'wattanam.academic-management.manage',
  ]);
  assert.equal(result.navigation[0].href, '/plugins/wattanam.academic-management/departments');
  assert.equal(result.navigation[1].href, '/plugins/wattanam.academic-management/study-years');
  assert.equal(result.navigation[2].href, '/plugins/wattanam.academic-management/classes');
});

test('exposes read-only routes without database writes', async () => {
  const calls = [];
  const result = await activate({
    query: async () => [],
    execute: async (sql, params) => { calls.push({ sql, params }); return { count: 1 }; },
  });
  await result.routes[0].handler();            // departments
  await result.routes[1].handler();            // study-years
  await result.routes[2].handler();            // study-years/current
  await result.routes[10].handler({ query: {} }); // classes
  await result.routes[15].handler();           // admissions/public/classes
  await result.routes[16].handler();           // admissions/public/form-config
  await result.routes[17].handler();           // admissions/settings
  await result.routes[18].handler();           // admissions/fields
  assert.equal(calls.length, 0);
});

test('admissions write handlers perform namespaced plugin writes', async () => {
  const calls = [];
  const events = [];
  const notifications = [];
  let classStatus = 'AVAILABLE';
  const registrations = new Map();
  const db = {
    query: async (sql, params = []) => {
      calls.push({ type: 'query', sql, params });
      const tableName = (sql.match(/FROM\s+([a-z0-9_]+)/i) || [])[1];
      if (tableName === REGISTRATION && sql.includes('WHERE "id" =')) {
        const reg = registrations.get(params[0]) || { id: params[0], classId: 'c1', nameEn: 'Student', status: 'PENDING', email: 's@t.test', passwordHash: 'hash' };
        return [reg];
      }
      if (tableName === CLASS) return [{ id: 'c1', name: 'Class A', registrationStatus: classStatus }];
      if (tableName === SETTINGS) return [{ id: 'singleton', khmerNameMode: 'HIDDEN', phoneMode: 'REQUIRED', emailMode: 'HIDDEN', photoMode: 'HIDDEN', passwordMode: 'HIDDEN', sexMode: 'HIDDEN', dateOfBirthMode: 'HIDDEN', addressMode: 'HIDDEN', generationMode: 'HIDDEN' }];
      if (tableName === FIELD) return [];
      return [];
    },
    execute: async (sql, params = []) => {
      calls.push({ type: 'execute', sql, params });
      if (sql.includes(`INSERT INTO ${REGISTRATION}`)) {
        const id = params[0];
        registrations.set(id, {
          id,
          classId: params[1],
          nameKh: params[2],
          nameEn: params[3],
          email: params[4],
          phone: params[5],
          passwordHash: params[6],
          status: 'PENDING',
        });
      }
      if (sql.includes(`UPDATE ${REGISTRATION}`) && sql.includes("'APPROVED'")) {
        const id = params[2];
        const reg = registrations.get(id) || { id, classId: 'c1', nameEn: 'Student', status: 'PENDING' };
        reg.status = 'APPROVED';
        registrations.set(id, reg);
      }
      return { count: 1 };
    },
  };
  const result = await activate(db, { events, notifications });
  const submitRoute = result.routes.find((r) => r.method === 'POST' && r.path === 'admissions/public/submit');
  const resolveRoute = result.routes.find((r) => r.method === 'PATCH' && r.path === 'admissions/registrations/:id/resolve');

  const created = await submitRoute.handler({
    method: 'POST', path: 'admissions/public/submit', params: {}, query: {},
    body: { classId: 'c1', nameEn: 'Student', phone: '012345678', customFieldValues: {} },
    principal: { userId: 'system-public-route', role: 'SUPER_ADMIN' },
  });
  assert.equal(created.status, 'PENDING');
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes(`INSERT INTO ${REGISTRATION}`)));

  calls.length = 0;
  const resolved = await resolveRoute.handler({
    method: 'PATCH', path: 'admissions/registrations/r1/resolve', params: { id: 'r1' }, query: {},
    body: { action: 'APPROVE' },
    principal: { userId: 'a1', role: 'ADMIN' },
  });
  assert.equal(resolved.status, 'APPROVED');
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes(`UPDATE ${REGISTRATION}`) && c.sql.includes("'APPROVED'")));
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'academic.registration.approved.v1');
});

test('class student-management write handlers perform core table writes', async () => {
  const calls = [];
  const db = {
    query: async (sql, params = []) => {
      calls.push({ type: 'query', sql, params });
      if (sql.includes('information_schema.tables')) return [];
      if (sql.includes(`FROM ${CLASS} WHERE "id"`)) return [{ id: params[0] }];
      if (sql.includes('COUNT(*)::int AS "count"')) return [{ count: 0 }];
      if (sql.includes('FROM "Student" WHERE "id" =')) {
        if (params[0] === 's1') return [{ id: 's1', userId: 'u1', studentNumber: '0001', classId: 'c1' }];
        return [];
      }
      if (sql.includes('FROM "Student" WHERE "userId"')) return [];
      if (sql.includes('FROM "Student" WHERE "classId" IS NULL')) return [{ id: 's2', userId: 'u2' }];
      if (sql.includes('FROM "User" WHERE "id"')) {
        if (params[0] === 'p1') return [{ id: 'p1', role: 'PARENT' }];
        return [{ id: params[0], role: 'STUDENT' }];
      }
      if (sql.includes('FROM "Student" s LEFT JOIN')) {
        return [{
          id: 's1', userId: 'u1', studentNumber: '0001', nameKh: 'បុប្ផា', qrCode: null, photo: null, sex: null,
          dateOfBirth: null, address: null, generation: null, customFieldValues: null, parentId: null,
          name: 'Bopha', email: 'b@t.test', phone: null, className: 'Class A',
        }];
      }
      return [];
    },
    execute: async (sql, params = []) => { calls.push({ type: 'execute', sql, params }); return { count: 1 }; },
    transaction: async (fn) => fn({ query: db.query, execute: db.execute }),
  };
  const result = await activate(db);
  const addRoute = result.routes.find((r) => r.method === 'POST' && r.path === 'classes/:id/students');
  const updateRoute = result.routes.find((r) => r.method === 'PATCH' && r.path === 'classes/:classId/students/:studentId');
  const removeRoute = result.routes.find((r) => r.method === 'DELETE' && r.path === 'classes/:id/students/:studentId');
  const cleanupRoute = result.routes.find((r) => r.method === 'POST' && r.path === 'classes/cleanup-orphaned-students');

  await addRoute.handler({ params: { id: 'c1' }, body: { studentId: 'u1' } });
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes('INSERT INTO "Student"')));

  calls.length = 0;
  await updateRoute.handler({ params: { classId: 'c1', studentId: 's1' }, body: { name: 'Bopha', nameKh: 'បុប្ផា' } });
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes('UPDATE "Student"')));
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes('UPDATE "User"')));

  calls.length = 0;
  await assert.rejects(updateRoute.handler({ params: { classId: 'c1', studentId: 's1' }, body: { parentId: 'u1' } }), /parentId must reference a user with role PARENT/);

  calls.length = 0;
  await removeRoute.handler({ params: { id: 'c1', studentId: 's1' } });
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes('DELETE FROM "Student"')));
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes('DELETE FROM "User"')));

  calls.length = 0;
  await cleanupRoute.handler({ params: {}, body: {} });
  assert.ok(calls.some((c) => c.type === 'execute' && c.sql.includes('DELETE FROM "Student"')));
});

test('manifest, UI, and additive namespaced migrations align with the preflight contract', () => {
  const manifest = json('plugins/wattanam.academic-management/plugin.json');
  const page = json('plugins/wattanam.academic-management/frontend/page.json');
  assert.equal(page.pages[0].permission, 'wattanam.academic-management.view');
  assert.equal(page.pages[0].dataSources.length, 1);
  assert.equal(page.pages[0].dataSources[0].method, 'GET');
  assert.equal(manifest.migrations.length, 8);
  for (const migration of manifest.migrations) {
    const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management', migration.path), 'utf8');
    assert.equal((sql.match(/;/g) || []).length, 1);
    assert.match(sql, /CREATE TABLE "plugin_wattanam_academic_management_/);
    assert.doesNotMatch(sql, /^\s*(?:DROP|ALTER|TRUNCATE|DELETE)\b/im);
  }
  const enrollmentSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management/migrations/003_create_enrollment_interval.sql'), 'utf8');
  assert.match(enrollmentSql, /academic_enrollment_valid_range/);
  assert.match(enrollmentSql, /academic_enrollment_one_current/);
  const studyYearSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management/migrations/004_create_study_year.sql'), 'utf8');
  assert.match(studyYearSql, /academic_study_year_unique_year/);
  assert.match(studyYearSql, /academic_study_year_one_current/);
  const classSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management/migrations/005_create_class.sql'), 'utf8');
  assert.match(classSql, /registrationStatus/);
  assert.match(classSql, /showPrice/);
  const registrationSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management/migrations/006_create_class_registration.sql'), 'utf8');
  assert.match(registrationSql, /customFieldValues/);
  assert.match(registrationSql, /passwordHash/);
  const registrationSettingsSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management/migrations/007_create_class_registration_settings.sql'), 'utf8');
  assert.match(registrationSettingsSql, /passwordMode/);
  const registrationFieldSql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'plugins/wattanam.academic-management/migrations/008_create_class_registration_field.sql'), 'utf8');
  assert.match(registrationFieldSql, /fieldType/);
  assert.match(registrationFieldSql, /options/);
});
