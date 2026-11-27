'use strict';
// Café POS: money rules (dollars and riel), and that screens, routes, permissions and the manifest agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, 'frontend/page.json'), 'utf8')).pages;
const plugin = require(path.join(root, 'backend/index.js'));
const money = require(path.join(root, 'backend/money.js'));

async function activated() {
  const routes = new Map(); let permissions = [], navigation = [];
  await plugin.activate({
    logger: { log() {} },
    database: { query: async () => [], execute: async () => ({ count: 1 }), transaction: async (work) => work({ query: async () => [], execute: async () => ({ count: 1 }) }) },
    routes: { register(route) { const key = `${route.method} ${route.path}`; assert.ok(!routes.has(key), `${key} registered once`); routes.set(key, route); return () => {}; } },
    permissions: { register(list) { permissions = list; return () => {}; } },
    navigation: { register(list) { navigation = list; return () => {}; } },
    settings: { get: async (k, d) => d, set: async () => {} },
    readModels: { publish: async () => {} }, directory: { lookupUsers: async () => [] },
  });
  return { routes, permissions, navigation };
}
const shape = (key) => key.replace(/:[^/]+/g, ':id');

test('money: conversions and riel rounding', () => {
  assert.equal(money.convert(250, 'USD', 'KHR', 4100), 10250);
  assert.equal(money.convert(5000, 'KHR', 'USD', 4000), 125);
  assert.equal(money.convert(1000, 'KHR', 'USD', 4100), 24, '1,000៛ = 24.39¢ → 24¢');
  assert.equal(money.roundRiel(10250), 10300); assert.equal(money.roundRiel(10249), 10200); assert.equal(money.roundRiel(10250, 1000), 10000);
  assert.throws(() => money.convert(1, 'USD', 'KHR', 0));
});

test('money: totals with discount, service charge and VAT (included or added)', () => {
  const lines = [{ lineTotal: 700 }, { lineTotal: 125 }];
  assert.deepEqual(money.orderTotals({ lines, vat: { enabled: true, rate: 1000, inclusive: true } }), { subtotal: 825, discount: 0, serviceCharge: 0, tax: 75, taxInclusive: true, roundOff: 0, total: 825 });
  const added = money.orderTotals({ lines, vat: { enabled: true, rate: 1000, inclusive: false } });
  assert.deepEqual([added.tax, added.total], [83, 908]);
  const discounted = money.orderTotals({ lines, discount: { type: 'PERCENT', value: 1000 }, serviceRate: 500, vat: { enabled: false } });
  assert.deepEqual([discounted.discount, discounted.serviceCharge, discounted.total], [83, 37, 779]);
  assert.equal(money.orderTotals({ lines, discount: { type: 'AMOUNT', value: 99999 } }).total, 0, 'a discount never goes below zero');
  const exempt = money.orderTotals({ lines: [{ lineTotal: 1000, taxable: true }, { lineTotal: 1000, taxable: false }], vat: { enabled: true, rate: 1000, inclusive: false } });
  assert.equal(exempt.tax, 100, 'VAT only on taxable items');
  const riel = money.orderTotals({ lines: [{ lineTotal: 10250 }], base: 'KHR' });
  assert.deepEqual([riel.total, riel.roundOff], [10300, 50]);
});

test('money: cash in dollars and riel, change in dollars then riel', () => {
  assert.deepEqual(money.cashTender({ due: 825, usd: 1000, rate: 4000 }), { tendered: 1000, amount: 825, change: 175, changeUsd: 100, changeKhr: 3000 });
  assert.deepEqual(money.cashTender({ due: 825, usd: 500, khr: 14000, rate: 4000 }), { tendered: 850, amount: 825, change: 25, changeUsd: 0, changeKhr: 1000 });
  assert.deepEqual(money.cashTender({ due: 825, usd: 500, rate: 4000 }), { tendered: 500, amount: 500, change: 0, changeUsd: 0, changeKhr: 0 }, 'part payment');
  assert.deepEqual(money.cashTender({ due: 13000, usd: 500, base: 'KHR', rate: 4000 }), { tendered: 20000, amount: 13000, change: 7000, changeUsd: 0, changeKhr: 7000 });
  assert.throws(() => money.cashTender({ due: 100, usd: 1.5, rate: 4000 }), /whole minor units/);
});

test('every screen data source is a registered route with the same permission', async () => {
  const { routes } = await activated();
  const byShape = new Map([...routes].map(([key, route]) => [shape(key), route]));
  for (const page of pages) {
    for (const source of page.dataSources) {
      const route = byShape.get(shape(`${source.method} ${source.path}`));
      assert.ok(route, `${page.id}: ${source.method} ${source.path} is registered`);
      assert.equal(route.permission, source.permission, `${page.id}: ${source.path} permission`);
    }
  }
});

test('every call a screen makes is a registered route', async () => {
  const { routes } = await activated();
  const shapes = new Set([...routes.keys()].map(shape));
  for (const page of pages) {
    const app = page.components.find((c) => c.type === 'app');
    const dir = path.join(root, path.dirname(app.options.entry));
    const html = fs.readFileSync(path.join(root, app.options.entry), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => path.join(dir, m[1])).filter((f) => !f.endsWith('wattanam-plugin-ui.js'));
    const code = scripts.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    for (const [, method, literal, more] of code.matchAll(/ui\.api\.(get|post|put|delete)\('([^']+)'((?:\s*\+\s*(?:encodeURIComponent\([^)]*\)|'[^']*'))*)/g)) {
      const parts = (more || '').split(/\+/).map((p) => p.trim()).filter(Boolean).map((p) => (p.startsWith("'") ? p.slice(1, -1) : ':id')).join('');
      const route = `${method.toUpperCase()} ${literal}${parts}`;
      assert.ok(shapes.has(shape(route)), `${page.id}: ${route} is registered`);
    }
  }
});

test('permissions, the sidebar and the manifest agree', async () => {
  const { routes, permissions, navigation } = await activated();
  for (const [key, route] of routes) {
    assert.ok(manifest.permissions.includes(route.permission), `${key} uses a declared permission`);
    assert.ok(route.contract && route.contract.errors.ORDER_NOT_OPEN, `${key} declares its errors`);
  }
  assert.deepEqual(permissions.map((p) => p.id).sort(), [...manifest.permissions].sort());
  const pick = (list) => list.map((e) => [e.id, e.label, e.href, e.permission]);
  assert.deepEqual(pick(navigation), pick(manifest.navigation));
  for (const entry of navigation) assert.ok(pages.some((p) => entry.href === `/plugins/${manifest.id}/${p.routePath}` && p.permission === entry.permission), `${entry.id} opens its page`);
});

test('screens use only the devices they declare; money columns are whole numbers', () => {
  for (const page of pages) {
    const app = page.components.find((c) => c.type === 'app');
    const dir = path.join(root, path.dirname(app.options.entry));
    const html = fs.readFileSync(path.join(root, app.options.entry), 'utf8');
    // the screen's own scripts (the shared pos.js prints only when a screen asks it to)
    const code = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => path.join(dir, m[1])).filter((f) => !/wattanam-plugin-ui\.js$|pos\.js$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const declared = app.options.devices || [];
    for (const [device, pattern] of Object.entries({ storage: /ui\.storage\.(get|set)/, scanner: /ui\.scanner\.start/, location: /ui\.location\(/, printer: /Pos\.(printOrder|openDrawer)\(|ui\.printer\./ })) {
      if (!declared.includes(device)) assert.doesNotMatch(code, pattern, `${page.id} uses ${device} without declaring it`);
    }
  }
  const sql = manifest.migrations.map((m) => fs.readFileSync(path.join(root, m.path), 'utf8')).join('\n');
  assert.doesNotMatch(sql, /\b(REAL|DOUBLE PRECISION|FLOAT)\b/, 'no floating-point money');
  for (const column of ['price', 'total', 'amount', 'paid', 'subtotal', 'cashUsd', 'cashKhr', 'floatUsd', 'expectedKhr']) {
    for (const m of sql.matchAll(new RegExp(`"${column}" (\\w+)`, 'g'))) assert.equal(m[1], 'BIGINT', `${column} is stored in whole minor units`);
  }
});

test('database calls follow the platform: query reads (SELECT), execute writes (INSERT, UPDATE, DELETE)', () => {
  // the school core refuses anything else at run time ("must be a SELECT statement")
  for (const file of fs.readdirSync(path.join(root, 'backend')).filter((f) => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(root, 'backend', file), 'utf8');
    for (const [, method, verb] of code.matchAll(/\.(query|execute)\(\s*`\s*([A-Za-z]+)/g)) {
      if (method === 'query') assert.equal(verb.toUpperCase(), 'SELECT', `${file}: query must be a SELECT (found ${verb})`);
      else assert.ok(['INSERT', 'UPDATE', 'DELETE'].includes(verb.toUpperCase()), `${file}: execute must write (found ${verb})`);
    }
  }
});
