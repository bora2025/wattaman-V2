'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', 'plugins', 'wattanam.academic-management');
const plugin = require(path.join(root, 'backend', 'index.js'));

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
    accounts: { createStudent: async () => ({}), updateStudent: async () => ({}) },
  });
  return { routes, permissions, navigation };
}

test('Academic Management exposes administration and full attendance workflows', async () => {
  const { routes, permissions, navigation } = await activate();
  for (const route of [
    'GET study-years', 'POST study-years', 'GET classes', 'POST classes',
    'GET officers', 'POST officers', 'PATCH officers/:id',
    'GET attendance', 'POST attendance', 'GET attendance/reports',
    'GET records', 'POST records', 'POST scan', 'PATCH records/:id/correct',
    'GET reports/summary', 'GET reports/print-data',
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
  ]) assert.ok(routes.has(route), `missing route ${route}`);
  assert.ok(permissions.some((permission) => permission.id === 'wattanam.academic-management.attendance'));
  assert.ok(permissions.some((permission) => permission.id === 'wattanam.academic-management.attendance.scan'));
  assert.ok(permissions.some((permission) => permission.id === 'wattanam.academic-management.attendance.self.scan'));
  assert.deepEqual(
    navigation.filter((item) => ['study-years', 'classes', 'officers', 'officer-attendance', 'attendance-records', 'attendance-scanner', 'attendance-reports'].includes(item.id)).map((item) => item.id),
    ['study-years', 'classes', 'officers', 'officer-attendance', 'attendance-records', 'attendance-scanner', 'attendance-reports'],
  );

  const ui = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'page.json'), 'utf8'));
  for (const page of ['study-years', 'classes', 'officers', 'officer-edit', 'officer-attendance', 'attendance-records', 'attendance-scanner', 'attendance-corrections', 'attendance-reports', 'attendance-settings', 'attendance-windows', 'student-attendance-scan', 'attendance-self-review', 'staff-attendance-scanner', 'staff-attendance-reports']) {
    assert.ok(ui.pages.some((candidate) => candidate.id === page), `missing UI page ${page}`);
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

