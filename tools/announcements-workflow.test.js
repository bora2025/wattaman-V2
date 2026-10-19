'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const plugin = require('../plugins/announcements/backend/index.js');

async function activate(database) {
  const routes = new Map();
  await plugin.activate({
    logger: { log() {} },
    database,
    settings: { get: async (_key, fallback) => fallback, set: async () => undefined },
    storage: { writeText: async () => undefined },
    permissions: { register() {} },
    navigation: { register() {} },
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); } },
    directory: {
      lookupUsers: async (ids) => ids.map((id) => ({ id, name: 'Administrator', role: 'ADMIN' })),
      lookupClasses: async () => [],
      classesForUser: async () => [],
      resolveAudience: async () => [],
    },
    notifications: { notifyInApp: async () => undefined, sendEmail: async () => undefined, sendSms: async () => undefined },
    realtime: { notifyUser() {} },
    jobs: { register: async () => undefined },
    events: { subscribe: () => () => undefined },
  });
  return routes;
}

test('Announcements exposes a universal-table-safe read count without breaking legacy clients', async () => {
  const database = {
    query: async (sql) => sql.includes('COUNT(*)')
      ? [{ id: 'announcement-1', count: 7 }]
      : [{ id: 'announcement-1', authorId: 'admin-1', title: 'Holiday', body: 'Closed', audience: 'SCHOOL', channels: 'IN_APP', pinned: false }],
    execute: async () => ({ count: 1 }),
  };
  const routes = await activate(database);
  const result = await routes.get('GET all').handler({ principal: { userId: 'admin-1', role: 'ADMIN' } });
  assert.equal(result[0].readCount, 7);
  assert.deepEqual(result[0]._count, { reads: 7 });
});
