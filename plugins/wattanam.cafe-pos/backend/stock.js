'use strict';

// Supplies (coffee beans, milk, cups…), recipes (what one item uses) and every stock movement. A paid order
// takes its recipes' supplies (orders.js); deliveries, waste and counts are recorded here.

const { T, PERM, CONTRACT, fail, newId, text, optional, int, bool, oneOf, idOf, iso, dateOnly } = require('./shared');

const quantity = (value, label, allowZero) => {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 1e9 || (!allowZero && n === 0) || Math.round(n * 1000) !== n * 1000) throw fail('INVALID_VALUE', `${label} must be a number with at most 3 decimals`);
  return n;
};

function registerStock(context) {
  const db = context.database;
  const register = (definition) => context.routes.register({ ...definition, contract: CONTRACT });
  const who = (request) => request?.principal?.userId || null;
  const supplyOut = (s) => ({ id: s.id, name: s.name, unit: s.unit, quantity: Number(s.quantity), lowAt: Number(s.lowAt), cost: s.cost === null ? null : Number(s.cost), currency: s.currency, active: s.active, low: Number(s.quantity) <= Number(s.lowAt), updatedAt: iso(s.updatedAt) });

  register({ method: 'GET', path: 'supplies', permission: PERM.stock, handler: async () => (await db.query(`SELECT * FROM ${T.supply} ORDER BY "active" DESC, "name"`)).map(supplyOut) });
  const supplyBody = (body) => ({ name: text(body.name, 'Name', 80, true), unit: text(body.unit || 'pcs', 'Unit', 20, true), lowAt: quantity(body.lowAt ?? 0, 'Low-stock level', true), cost: body.cost === undefined || body.cost === null || body.cost === '' ? null : int(body.cost, 'Cost', 0, 100000000000), currency: oneOf(body.currency || 'USD', ['USD', 'KHR'], 'currency'), active: bool(body.active, true) });
  register({
    method: 'POST', path: 'supplies', permission: PERM.stock,
    handler: async (request) => {
      const s = supplyBody(request?.body || {}); const id = newId();
      const opening = request?.body?.quantity ? quantity(request.body.quantity, 'Quantity', true) : 0;
      await db.transaction(async (tx) => {
        await tx.execute(`INSERT INTO ${T.supply} ("id", "name", "unit", "quantity", "lowAt", "cost", "currency", "active") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, s.name, s.unit, opening, s.lowAt, s.cost, s.currency, s.active]);
        if (opening) await tx.execute(`INSERT INTO ${T.stockMove} ("id", "supplyId", "kind", "quantity", "note", "createdBy") VALUES ($1, $2, 'ADJUST', $3, 'Opening stock', $4)`, [newId(), id, opening, who(request)]);
      });
      return supplyOut((await db.query(`SELECT * FROM ${T.supply} WHERE "id" = $1`, [id]))[0]);
    },
  });
  register({
    method: 'PUT', path: 'supplies/:id', permission: PERM.stock,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const s = supplyBody(request?.body || {});
      const r = await db.execute(`UPDATE ${T.supply} SET "name" = $2, "unit" = $3, "lowAt" = $4, "cost" = $5, "currency" = $6, "active" = $7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, s.name, s.unit, s.lowAt, s.cost, s.currency, s.active]);
      if (!r.count) throw fail('NOT_FOUND', 'Supply not found');
      return supplyOut((await db.query(`SELECT * FROM ${T.supply} WHERE "id" = $1`, [id]))[0]);
    },
  });
  // a delivery (RECEIVE), waste, or a count (COUNT sets the quantity; recorded as the difference)
  register({
    method: 'POST', path: 'supplies/:id/movements', permission: PERM.stock,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const body = request?.body || {};
      const kind = oneOf(body.kind, ['RECEIVE', 'WASTE', 'COUNT'], 'kind');
      const note = optional(body.note, 'Note', 200);
      await db.transaction(async (tx) => {
        const supply = (await tx.query(`SELECT * FROM ${T.supply} WHERE "id" = $1 FOR UPDATE`, [id]))[0];
        if (!supply) throw fail('NOT_FOUND', 'Supply not found');
        let change;
        if (kind === 'COUNT') change = quantity(body.quantity, 'Counted quantity', true) - Number(supply.quantity);
        else { const q = quantity(body.quantity, 'Quantity'); if (q < 0) throw fail('INVALID_VALUE', 'Quantity must be more than zero'); change = kind === 'RECEIVE' ? q : -q; }
        if (!change) return;
        await tx.execute(`UPDATE ${T.supply} SET "quantity" = "quantity" + $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, change]);
        await tx.execute(`INSERT INTO ${T.stockMove} ("id", "supplyId", "kind", "quantity", "note", "createdBy") VALUES ($1, $2, $3, $4, $5, $6)`, [newId(), id, kind === 'COUNT' ? 'ADJUST' : kind, change, note, who(request)]);
      });
      return supplyOut((await db.query(`SELECT * FROM ${T.supply} WHERE "id" = $1`, [id]))[0]);
    },
  });
  register({
    method: 'GET', path: 'supplies/:id/movements', permission: PERM.stock,
    handler: async (request) => (await db.query(`SELECT m.*, o."number" FROM ${T.stockMove} m LEFT JOIN ${T.order} o ON o."id" = m."orderId" WHERE m."supplyId" = $1 ORDER BY m."createdAt" DESC LIMIT 200`, [idOf(request?.params?.id)]))
      .map((m) => ({ id: m.id, kind: m.kind, quantity: Number(m.quantity), orderNumber: m.number || null, note: m.note || '', createdAt: iso(m.createdAt), createdBy: m.createdBy })),
  });

  // recipes: what one of a product (or one of its sizes) uses
  register({
    method: 'GET', path: 'recipes/:productId', permission: PERM.stock,
    handler: async (request) => (await db.query(`SELECT r.*, s."name" AS "supplyName", s."unit" FROM ${T.recipe} r JOIN ${T.supply} s ON s."id" = r."supplyId" WHERE r."productId" = $1 ORDER BY s."name"`, [idOf(request?.params?.productId)]))
      .map((r) => ({ id: r.id, supplyId: r.supplyId, supplyName: r.supplyName, unit: r.unit, variantId: r.variantId, quantity: Number(r.quantity) })),
  });
  register({
    method: 'PUT', path: 'recipes/:productId', permission: PERM.stock,
    handler: async (request) => {
      const productId = idOf(request?.params?.productId);
      const lines = (Array.isArray(request?.body?.items) ? request.body.items : []).slice(0, 50).map((l) => ({ supplyId: idOf(l.supplyId, 'supplyId'), variantId: l.variantId ? idOf(l.variantId, 'variantId') : null, quantity: quantity(l.quantity, 'Quantity') }));
      if (lines.some((l) => l.quantity < 0)) throw fail('INVALID_VALUE', 'Recipe quantities must be more than zero');
      await db.transaction(async (tx) => {
        if (!(await tx.query(`SELECT 1 FROM ${T.product} WHERE "id" = $1`, [productId])).length) throw fail('NOT_FOUND', 'Product not found');
        const supplies = [...new Set(lines.map((l) => l.supplyId))];
        if (supplies.length && (await tx.query(`SELECT "id" FROM ${T.supply} WHERE "id" = ANY($1::text[])`, [supplies])).length !== supplies.length) throw fail('NOT_FOUND', 'A supply does not exist');
        await tx.execute(`DELETE FROM ${T.recipe} WHERE "productId" = $1`, [productId]);
        for (const l of lines) await tx.execute(`INSERT INTO ${T.recipe} ("id", "productId", "variantId", "supplyId", "quantity") VALUES ($1, $2, $3, $4, $5)`, [newId(), productId, l.variantId, l.supplyId, l.quantity]);
      });
      return { productId, items: lines.length };
    },
  });
}

// ---------- customers and loyalty points ----------
function registerCustomers(context) {
  const db = context.database;
  const register = (definition) => context.routes.register({ ...definition, contract: CONTRACT });
  const out = (c) => ({ id: c.id, name: c.name, phone: c.phone || '', note: c.note || '', points: Number(c.points), active: c.active, createdAt: iso(c.createdAt) });
  const phone = (value) => { const p = String(value || '').replace(/[^\d+]/g, ''); if (p && (p.length < 6 || p.length > 20)) throw fail('INVALID_VALUE', 'Phone number is not valid'); return p || null; };
  const save = async (id, body, creating) => {
    const c = { name: text(body.name, 'Name', 100, true), phone: phone(body.phone), note: optional(body.note, 'Note', 300), active: bool(body.active, true) };
    try {
      if (creating) await db.execute(`INSERT INTO ${T.customer} ("id", "name", "phone", "note", "active") VALUES ($1, $2, $3, $4, $5)`, [id, c.name, c.phone, c.note, c.active]);
      else { const r = await db.execute(`UPDATE ${T.customer} SET "name" = $2, "phone" = $3, "note" = $4, "active" = $5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, c.name, c.phone, c.note, c.active]); if (!r.count) throw fail('NOT_FOUND', 'Customer not found'); }
    } catch (error) { if (/unique|duplicate|23505|already exists/i.test(`${error && error.code} ${error && error.message}`)) throw fail('PHONE_TAKEN'); throw error; }
    return out((await db.query(`SELECT * FROM ${T.customer} WHERE "id" = $1`, [id]))[0]);
  };
  // the counter looks customers up by name or phone, and can add one at the till
  register({
    method: 'GET', path: 'customers', permission: PERM.sell,
    handler: async (request) => {
      const search = String(request?.query?.search || '').trim().slice(0, 60);
      const rows = search
        ? await db.query(`SELECT * FROM ${T.customer} WHERE "active" = TRUE AND ("name" ILIKE $1 OR "phone" LIKE $2) ORDER BY "name" LIMIT 30`, [`%${search}%`, `%${search.replace(/[^\d+]/g, '') || '¤'}%`])
        : await db.query(`SELECT * FROM ${T.customer} ORDER BY "updatedAt" DESC LIMIT 200`);
      return rows.map(out);
    },
  });
  register({ method: 'POST', path: 'customers', permission: PERM.sell, handler: (request) => save(newId(), request?.body || {}, true) });
  register({ method: 'PUT', path: 'customers/:id', permission: PERM.customers, handler: (request) => save(idOf(request?.params?.id), request?.body || {}, false) });
  register({
    method: 'GET', path: 'customers/:id', permission: PERM.customers,
    handler: async (request) => {
      const id = idOf(request?.params?.id);
      const c = (await db.query(`SELECT * FROM ${T.customer} WHERE "id" = $1`, [id]))[0];
      if (!c) throw fail('NOT_FOUND', 'Customer not found');
      const [points, orders] = await Promise.all([
        db.query(`SELECT l.*, o."number" FROM ${T.loyalty} l LEFT JOIN ${T.order} o ON o."id" = l."orderId" WHERE l."customerId" = $1 ORDER BY l."createdAt" DESC LIMIT 100`, [id]),
        db.query(`SELECT "id", "number", "businessDate", "status", "total", "baseCurrency" FROM ${T.order} WHERE "customerId" = $1 ORDER BY "createdAt" DESC LIMIT 50`, [id]),
      ]);
      return { ...out(c), history: points.map((p) => ({ kind: p.kind, points: p.points, orderNumber: p.number || null, note: p.note || '', createdAt: iso(p.createdAt) })),
        orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, total: Number(o.total), currency: o.baseCurrency, businessDate: dateOnly(o.businessDate) })) };
    },
  });
  // a manual points correction (a gift, a mistake)
  register({
    method: 'POST', path: 'customers/:id/points', permission: PERM.customers,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const points = int(request?.body?.points, 'Points', -1000000, 1000000);
      if (!points) throw fail('INVALID_VALUE', 'Points cannot be zero');
      const note = text(request?.body?.note, 'Reason', 200, true);
      await db.transaction(async (tx) => {
        const r = await tx.execute(`UPDATE ${T.customer} SET "points" = "points" + $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "points" + $2 >= 0`, [id, points]);
        if (!r.count) throw fail('NOT_ENOUGH_POINTS');
        await tx.execute(`INSERT INTO ${T.loyalty} ("id", "customerId", "kind", "points", "note") VALUES ($1, $2, 'ADJUST', $3, $4)`, [newId(), id, points, note]);
      });
      return out((await db.query(`SELECT * FROM ${T.customer} WHERE "id" = $1`, [id]))[0]);
    },
  });
}

module.exports = { registerStock, registerCustomers };
