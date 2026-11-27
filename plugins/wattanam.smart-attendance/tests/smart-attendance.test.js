'use strict';
// Smart Attendance: the screens, routes, permissions and contracts agree, and stored codes stay hashed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, 'frontend/page.json'), 'utf8')).pages;
const plugin = require(path.join(root, 'backend/index.js'));
// The routes Academic Management and Organizing Management open to these screens (partner screens).
const partnerRoutes = {
  'wattanam.academic-management': require(path.join(root, '../wattanam.academic-management/backend/smart-attendance-callers.js')).ROUTES,
  'wattanam.organizing-management': require(path.join(root, '../wattanam.organizing-management/backend/smart-attendance-callers.js')).ROUTES,
};
const shape = (method, routePath) => `${method} ${routePath.replace(/:[^/]+/g, ':id')}`;
// the scripts of an app screen (its folder)
const appScripts = (entry) => {
  const dir = path.join(root, path.dirname(entry));
  return fs.readdirSync(dir).filter((name) => name.endsWith('.js')).map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n');
};

async function activated() {
  const routes = new Map(), settings = new Map(), consumers = [], executed = [];
  const db = {
    query: async () => [], execute: async (sql, params) => { executed.push({ sql, params }); return { count: 1 }; },
    transaction: async (work) => work({ query: async () => [], execute: async (sql, params) => { executed.push({ sql, params }); return { count: 1 }; }, publish: async () => {} }),
  };
  let permissions = [], navigation = [];
  await plugin.activate({
    logger: { log() {} }, database: db,
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); return () => {}; } },
    permissions: { register(list) { permissions = list; return () => {}; } },
    navigation: { register(list) { navigation = list; return () => {}; } },
    settings: { get: async (k, d) => (settings.has(k) ? settings.get(k) : d), set: async (k, v) => { settings.set(k, v); } },
    readModels: { read: async () => [] },
    durableEvents: { subscribe(definition) { consumers.push(definition); return () => {}; } },
    dependencies: { required: {}, optional: {}, isAvailable: async () => true },
  });
  return { routes, settings, consumers, permissions, navigation, executed };
}

test('every screen data source is a registered route with the same permission', async () => {
  const { routes } = await activated();
  for (const page of pages) {
    for (const source of page.dataSources) {
      if (source.plugin) {
        // a partner's route: the partner opens it to Smart Attendance, with its own permission
        assert.ok(manifest.optionalDependencies[source.plugin], `${page.id}: ${source.plugin} is a dependency`);
        assert.ok(partnerRoutes[source.plugin].includes(shape(source.method, source.path)), `${page.id}: ${source.plugin} opens ${source.method} ${source.path}`);
        assert.ok(source.permission.startsWith(source.plugin + '.'), `${page.id}: ${source.path} uses ${source.plugin}'s permission`);
        continue;
      }
      const route = routes.get(`${source.method} ${source.path}`);
      assert.ok(route, `${page.id}: ${source.method} ${source.path} is registered`);
      assert.equal(route.permission, source.permission, `${page.id}: ${source.path} permission`);
    }
  }
});

test('routes declare their errors; permissions and contracts match the manifest', async () => {
  const { routes, permissions, consumers } = await activated();
  for (const [key, route] of routes) {
    assert.ok(manifest.permissions.includes(route.permission), `${key} uses a declared permission`);
    assert.ok(route.contract && route.contract.errors.STATION_NOT_ACTIVE, `${key} declares its errors`);
  }
  assert.deepEqual(permissions.map((p) => p.id).sort(), [...manifest.permissions].sort());
  assert.deepEqual(consumers.map((c) => c.event), Object.keys(manifest.contracts.events.subscribes));
  assert.equal(plugin.id, manifest.id);
});

test('a per-school card key is made once and kept', async () => {
  const { settings } = await activated();
  assert.match(settings.get('card-key'), /^[0-9a-f]{64}$/);
});

test('station screens use only the devices they declare', () => {
  const use = { scanner: /ui\.scanner\.start/, 'device-id': /ui\.deviceId\(/, face: /ui\.face\.start/, nfc: /ui\.nfc\.start/, storage: /ui\.storage\.(get|set)/, location: /ui\.location\(/ };
  for (const page of pages) {
    const app = page.components.find((c) => c.type === 'app');
    if (!app) continue;
    const source = appScripts(app.options.entry);
    const declared = app.options.devices || [];
    for (const [device, pattern] of Object.entries(use)) {
      if (declared.includes(device)) assert.match(source, pattern, `${page.id} declares ${device} and uses it`);
      else assert.doesNotMatch(source, pattern, `${page.id} uses ${device} without declaring it`);
    }
  }
  assert.deepEqual(pages.find((p) => p.id === 'station').components[0].options.devices, ['scanner', 'device-id', 'face', 'nfc', 'storage']);
  // a screen reading faces: the plugin says it keeps biometric data (the school sees it before installing)
  assert.ok(manifest.operational.dataClassification.includes('biometric-data'));
});

test('codes and card numbers are stored only as hashes', () => {
  const backend = fs.readFileSync(path.join(root, 'backend/index.js'), 'utf8');
  assert.match(backend, /"codeHash"/); assert.match(backend, /createHmac\('sha256', cardKey\)/);
  assert.doesNotMatch(backend, /INSERT INTO \$\{T\.card\}[^`]*"uid"[^H]/, 'no plain card number column');
  const migrations = manifest.migrations.map((m) => fs.readFileSync(path.join(root, m.path), 'utf8')).join('\n');
  assert.doesNotMatch(migrations, /"uid"\s+TEXT/); assert.doesNotMatch(migrations, /"code"\s+TEXT/);
});

test('the sidebar entries are registered at activation, as the manifest declares them', async () => {
  const { navigation } = await activated();
  const pick = (list) => list.map((e) => [e.id, e.label, e.href, e.permission]);
  assert.deepEqual(pick(navigation), pick(manifest.navigation));
  for (const entry of navigation) assert.ok(pages.some((p) => entry.href === '/plugins/' + manifest.id + '/' + p.routePath && p.permission === entry.permission), entry.id + ' opens its page');
});

test('moved screens call only the routes their owner opened to Smart Attendance', () => {
  for (const page of pages) {
    for (const app of page.components.filter((c) => c.type === 'app' && c.options.apis)) {
      const scripts = appScripts(app.options.entry);
      for (const owner of app.options.apis) {
        const variable = owner === 'wattanam.academic-management' ? 'academic' : 'organizing';
        assert.match(scripts, new RegExp(`var ${variable} = ui\\.partner\\('${owner.replace(/\./g, '\\.')}'\\)`), `${page.id} calls ${owner} as a partner`);
        // 'path' or 'path/' + encodeURIComponent(id) + '/rest' (a value in the middle is a route parameter)
        const calls = [...scripts.matchAll(new RegExp(`\\b${variable}\\.(get|post|put|patch|delete)\\('([^']+)'((?:\\s*\\+\\s*(?:encodeURIComponent\\([^)]*\\)|'[^']*'))*)`, 'g'))];
        assert.ok(calls.length, `${page.id} calls ${owner}`);
        for (const [, method, literal, more] of calls) {
          const routePath = more ? `${literal}:id${(more.match(/\+\s*'([^']*)'\s*$/) || [, ''])[1]}` : literal;
          assert.ok(partnerRoutes[owner].includes(shape(method.toUpperCase(), routePath)), `${page.id}: ${method.toUpperCase()} ${routePath} is opened by ${owner}`);
        }
      }
      assert.doesNotMatch(scripts, /ui\.api\./, `${page.id} does not call Smart Attendance's own API by mistake`);
    }
  }
});

test('a new device registers itself; a Wattaman device is approved at once (0.4.0)', async () => {
  // a tiny station table: INSERT, the auto-approval UPDATE and the lookup by device
  const stations = [];
  const settings = new Map();
  const db = {
    query: async (sql, params) => (/FROM plugin_wattanam_smart_attendance_station WHERE "deviceIdHash"/.test(sql) ? stations.filter((s) => s.deviceIdHash === params[0]) : []),
    execute: async (sql, params) => {
      if (/^INSERT INTO plugin_wattanam_smart_attendance_station /.test(sql)) stations.push({ id: params[0], name: params[1], place: params[2], deviceIdHash: params[3], requestedBy: params[4], status: 'PENDING', mode: 'AUTO', methods: ['QR', 'NFC'], classIds: [] });
      if (/^UPDATE plugin_wattanam_smart_attendance_station SET "status" = 'ACTIVE'/.test(sql)) stations.filter((s) => s.id === params[0] && s.status === 'PENDING').forEach((s) => Object.assign(s, { status: 'ACTIVE', methods: JSON.parse(params[1]), approvedBy: params[2] }));
      return { count: 1 };
    },
    transaction: async (work) => work({ query: async () => [], execute: async () => ({ count: 1 }), publish: async () => {} }),
  };
  const routes = new Map();
  await plugin.activate({
    logger: { log() {} }, database: db,
    routes: { register(route) { routes.set(`${route.method} ${route.path}`, route); return () => {}; } },
    permissions: { register() { return () => {}; } }, navigation: { register() { return () => {}; } },
    settings: { get: async (k, d) => (settings.has(k) ? settings.get(k) : d), set: async (k, v) => { settings.set(k, v); } },
    readModels: { read: async () => [] }, durableEvents: { subscribe() { return () => {}; } },
    dependencies: { required: {}, optional: {}, isAvailable: async () => true },
  });
  const registerStation = (role, deviceId, extra = {}) => routes.get('POST stations/register').handler({ principal: { userId: `u-${role}`, role }, body: { deviceId, device: 'Chrome on Android', ...extra } });

  const guard = await registerStation('WATTAMAN', 'device-wattaman-1');
  assert.equal(guard.station.status, 'ACTIVE');
  assert.equal(guard.autoApproved, true);
  assert.deepEqual(guard.station.methods, ['QR', 'NFC', 'FACE']);
  assert.match(guard.station.name, /^Wattaman · Chrome on Android · \d{4}-\d{2}-\d{2}$/);

  const teacher = await registerStation('TEACHER', 'device-teacher-1');
  assert.equal(teacher.station.status, 'PENDING', 'other roles still wait for an administrator');
  assert.match(teacher.station.name, /^Station · Chrome on Android/);
  // the same device opened later by a Wattaman: approved then
  assert.equal((await registerStation('WATTAMAN', 'device-teacher-1')).station.status, 'ACTIVE');

  // the setting turns it off
  settings.set('wattaman-auto-approve', false);
  assert.equal((await registerStation('WATTAMAN', 'device-wattaman-2')).station.status, 'PENDING');
  assert.equal((await routes.get('GET settings').handler({})).wattamanAutoApprove, false);
});

test('the station opens the automatic station: face, QR codes and card readers together', () => {
  const station = fs.readFileSync(path.join(root, 'ui/station/station.js'), 'utf8');
  assert.match(station, /ui\.face\.start\(\{\s*mode: 'identify', title: title\(\), liveness: state\.liveness, codes: codes, faces: faces,/);
  assert.match(station, /onCode: function \(text, source\)/);
  assert.match(station, /if \(!state\.autoOpened && !state\.overlay\) startAuto\(\);/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'ui/station/index.html'), 'utf8'), /id="r-name"/, 'nothing to type when setting up a station');
});

test('face attendance asks for the head turn and blink only when the school turns it on (0.4.1)', async () => {
  const { routes, settings } = await activated();
  const me = routes.get('GET stations/me');
  assert.equal((await me.handler({ query: { deviceId: 'd1' }, principal: { userId: 'u', role: 'WATTAMAN' } })).livenessRequired, false, 'off by default');
  assert.equal((await routes.get('GET settings').handler({})).livenessRequired, false);
  settings.set('liveness-required', true);
  assert.equal((await me.handler({ query: { deviceId: 'd1' }, principal: { userId: 'u', role: 'WATTAMAN' } })).livenessRequired, true);
  const station = fs.readFileSync(path.join(root, 'ui/station/station.js'), 'utf8');
  assert.match(station, /state\.liveness = r\.livenessRequired === true;/);
  assert.doesNotMatch(station, /liveness: true/, 'the station follows the setting');
});
