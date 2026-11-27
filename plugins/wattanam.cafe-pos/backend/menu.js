'use strict';

// The menu (categories, products with sizes and photos, add-on groups), kitchen stations and the floor plan.
// The counter reads the whole active menu in one call (GET menu) and keeps it on the device.

const { T, PERM, CONTRACT, fail, newId, text, optional, int, bool, oneOf, idOf, jsonList, image } = require('./shared');

const money = (value, label) => int(value, label, 0, 100000000000);

function registerMenu(context) {
  const db = context.database;
  const register = (definition) => context.routes.register({ ...definition, contract: CONTRACT });

  const categoryOut = (row) => ({ id: row.id, name: row.name, nameKh: row.nameKh || '', color: row.color || '', sortOrder: row.sortOrder, active: row.active });
  const productOut = (row, variants, groupIds) => ({
    id: row.id, categoryId: row.categoryId, name: row.name, nameKh: row.nameKh || '', description: row.description || '',
    price: Number(row.price), currency: row.currency, cost: row.cost === null ? null : Number(row.cost), sku: row.sku || '', barcode: row.barcode || '',
    photo: row.photo || null, taxable: row.taxable, sortOrder: row.sortOrder, active: row.active,
    variants: (variants || []).map((v) => ({ id: v.id, name: v.name, nameKh: v.nameKh || '', price: Number(v.price), sortOrder: v.sortOrder, active: v.active })),
    addonGroupIds: groupIds || [],
  });
  const groupOut = (row, addons) => ({
    id: row.id, name: row.name, nameKh: row.nameKh || '', required: row.required, minSelect: row.minSelect, maxSelect: row.maxSelect, sortOrder: row.sortOrder, active: row.active,
    addons: (addons || []).map((a) => ({ id: a.id, name: a.name, nameKh: a.nameKh || '', price: Number(a.price), currency: a.currency, sortOrder: a.sortOrder, active: a.active })),
  });

  const loadMenu = async (activeOnly) => {
    const only = activeOnly ? 'WHERE "active" = TRUE' : '';
    const [categories, products, variants, links, groups, addons, stations] = await Promise.all([
      db.query(`SELECT * FROM ${T.category} ${only} ORDER BY "sortOrder", "name"`),
      db.query(`SELECT * FROM ${T.product} ${only} ORDER BY "sortOrder", "name"`),
      db.query(`SELECT * FROM ${T.variant} ${only} ORDER BY "sortOrder", "price"`),
      db.query(`SELECT "productId", "groupId" FROM ${T.productGroup}`),
      db.query(`SELECT * FROM ${T.group} ${only} ORDER BY "sortOrder", "name"`),
      db.query(`SELECT * FROM ${T.addon} ${only} ORDER BY "sortOrder", "name"`),
      db.query(`SELECT * FROM ${T.station} ORDER BY "sortOrder", "name"`),
    ]);
    const by = (rows, key) => rows.reduce((map, row) => map.set(row[key], [...(map.get(row[key]) || []), row]), new Map());
    const variantsOf = by(variants, 'productId'), addonsOf = by(addons, 'groupId');
    const groupsOf = links.reduce((map, l) => map.set(l.productId, [...(map.get(l.productId) || []), l.groupId]), new Map());
    return {
      categories: categories.map(categoryOut),
      products: products.map((p) => productOut(p, variantsOf.get(p.id), groupsOf.get(p.id))),
      addonGroups: groups.map((g) => groupOut(g, addonsOf.get(g.id))),
      stations: stations.map((s) => ({ id: s.id, name: s.name, categoryIds: jsonList(s.categoryIds), sortOrder: s.sortOrder, active: s.active })),
    };
  };
  // the counter: active items only (photos included; the device keeps the menu)
  register({ method: 'GET', path: 'menu', permission: PERM.sell, handler: () => loadMenu(true) });
  // the Menu screen: everything, including items taken off the menu
  register({ method: 'GET', path: 'menu/all', permission: PERM.menu, handler: () => loadMenu(false) });

  // ---------- categories ----------
  const categoryBody = (body) => ({ name: text(body.name, 'Name', 80, true), nameKh: optional(body.nameKh, 'Khmer name', 80), color: optional(body.color, 'Colour', 20), sortOrder: int(body.sortOrder ?? 0, 'Order', -10000, 10000), active: bool(body.active, true) });
  register({
    method: 'POST', path: 'categories', permission: PERM.menu,
    handler: async (request) => {
      const c = categoryBody(request?.body || {}); const id = newId();
      await db.execute(`INSERT INTO ${T.category} ("id", "name", "nameKh", "color", "sortOrder", "active") VALUES ($1, $2, $3, $4, $5, $6)`, [id, c.name, c.nameKh, c.color, c.sortOrder, c.active]);
      return { id, ...c };
    },
  });
  register({
    method: 'PUT', path: 'categories/:id', permission: PERM.menu,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const c = categoryBody(request?.body || {});
      const r = await db.execute(`UPDATE ${T.category} SET "name" = $2, "nameKh" = $3, "color" = $4, "sortOrder" = $5, "active" = $6, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, c.name, c.nameKh, c.color, c.sortOrder, c.active]);
      if (!r.count) throw fail('NOT_FOUND', 'Category not found');
      return { id, ...c };
    },
  });

  // ---------- products (with their sizes and add-on groups) ----------
  const productBody = async (body) => {
    const p = {
      categoryId: body.categoryId ? idOf(body.categoryId, 'categoryId') : null,
      name: text(body.name, 'Name', 120, true), nameKh: optional(body.nameKh, 'Khmer name', 120), description: optional(body.description, 'Description', 500),
      price: money(body.price, 'Price'), currency: oneOf(body.currency || 'USD', ['USD', 'KHR'], 'currency'),
      cost: body.cost === undefined || body.cost === null || body.cost === '' ? null : money(body.cost, 'Cost'),
      sku: optional(body.sku, 'SKU', 60), barcode: optional(body.barcode, 'Barcode', 60), photo: image(body.photo, 'Photo'),
      taxable: bool(body.taxable, true), sortOrder: int(body.sortOrder ?? 0, 'Order', -10000, 10000), active: bool(body.active, true),
    };
    const variants = (Array.isArray(body.variants) ? body.variants : []).slice(0, 20).map((v, i) => ({
      id: v.id ? idOf(v.id, 'variant id') : null, name: text(v.name, 'Size name', 60, true), nameKh: optional(v.nameKh, 'Khmer size name', 60),
      price: money(v.price, 'Size price'), sortOrder: int(v.sortOrder ?? i, 'Order', -10000, 10000), active: bool(v.active, true),
    }));
    const groupIds = [...new Set((Array.isArray(body.addonGroupIds) ? body.addonGroupIds : []).map((g) => idOf(g, 'addonGroupId')))].slice(0, 20);
    if (groupIds.length) {
      const known = await db.query(`SELECT "id" FROM ${T.group} WHERE "id" = ANY($1::text[])`, [groupIds]);
      if (known.length !== groupIds.length) throw fail('INVALID_VALUE', 'An add-on group does not exist');
    }
    return { p, variants, groupIds };
  };
  const saveProduct = async (id, body, creating) => {
    const { p, variants, groupIds } = await productBody(body || {});
    await db.transaction(async (tx) => {
      if (creating) {
        await tx.execute(`INSERT INTO ${T.product} ("id", "categoryId", "name", "nameKh", "description", "price", "currency", "cost", "sku", "barcode", "photo", "taxable", "sortOrder", "active") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [id, p.categoryId, p.name, p.nameKh, p.description, p.price, p.currency, p.cost, p.sku, p.barcode, p.photo, p.taxable, p.sortOrder, p.active]);
      } else {
        // the photo is kept unless a new one (or an explicit null) is sent
        const keepPhoto = body.photo === undefined;
        const r = await tx.execute(`UPDATE ${T.product} SET "categoryId" = $2, "name" = $3, "nameKh" = $4, "description" = $5, "price" = $6, "currency" = $7, "cost" = $8, "sku" = $9, "barcode" = $10,
          "photo" = CASE WHEN $15 THEN "photo" ELSE $11 END, "taxable" = $12, "sortOrder" = $13, "active" = $14, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          [id, p.categoryId, p.name, p.nameKh, p.description, p.price, p.currency, p.cost, p.sku, p.barcode, p.photo, p.taxable, p.sortOrder, p.active, keepPhoto]);
        if (!r.count) throw fail('NOT_FOUND', 'Product not found');
      }
      // sizes: kept by id (past orders keep their own copy of the name and price); removed ones are turned off
      const keep = [];
      for (const v of variants) {
        const vid = v.id || newId(); keep.push(vid);
        await tx.execute(`INSERT INTO ${T.variant} ("id", "productId", "name", "nameKh", "price", "sortOrder", "active") VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "nameKh" = EXCLUDED."nameKh", "price" = EXCLUDED."price", "sortOrder" = EXCLUDED."sortOrder", "active" = EXCLUDED."active"`,
          [vid, id, v.name, v.nameKh, v.price, v.sortOrder, v.active]);
      }
      await tx.execute(`UPDATE ${T.variant} SET "active" = FALSE WHERE "productId" = $1 AND NOT ("id" = ANY($2::text[]))`, [id, keep]);
      await tx.execute(`DELETE FROM ${T.productGroup} WHERE "productId" = $1`, [id]);
      for (const groupId of groupIds) await tx.execute(`INSERT INTO ${T.productGroup} ("productId", "groupId") VALUES ($1, $2)`, [id, groupId]);
    });
    return { id };
  };
  register({ method: 'POST', path: 'products', permission: PERM.menu, handler: (request) => saveProduct(newId(), request?.body, true) });
  register({ method: 'PUT', path: 'products/:id', permission: PERM.menu, handler: (request) => saveProduct(idOf(request?.params?.id), request?.body, false) });

  // ---------- add-on groups (milk, sugar level, extra shot…) ----------
  const saveGroup = async (id, body, creating) => {
    const g = {
      name: text(body.name, 'Name', 80, true), nameKh: optional(body.nameKh, 'Khmer name', 80), required: bool(body.required, false),
      minSelect: int(body.minSelect ?? 0, 'Minimum', 0, 20), maxSelect: int(body.maxSelect ?? 1, 'Maximum', 1, 20),
      sortOrder: int(body.sortOrder ?? 0, 'Order', -10000, 10000), active: bool(body.active, true),
    };
    if (g.minSelect > g.maxSelect) throw fail('INVALID_VALUE', 'The minimum cannot be more than the maximum');
    if (g.required && g.minSelect < 1) g.minSelect = 1;
    const addons = (Array.isArray(body.addons) ? body.addons : []).slice(0, 40).map((a, i) => ({
      id: a.id ? idOf(a.id, 'add-on id') : null, name: text(a.name, 'Choice', 60, true), nameKh: optional(a.nameKh, 'Khmer choice', 60),
      price: money(a.price ?? 0, 'Choice price'), currency: oneOf(a.currency || 'USD', ['USD', 'KHR'], 'currency'), sortOrder: int(a.sortOrder ?? i, 'Order', -10000, 10000), active: bool(a.active, true),
    }));
    await db.transaction(async (tx) => {
      if (creating) await tx.execute(`INSERT INTO ${T.group} ("id", "name", "nameKh", "required", "minSelect", "maxSelect", "sortOrder", "active") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, g.name, g.nameKh, g.required, g.minSelect, g.maxSelect, g.sortOrder, g.active]);
      else {
        const r = await tx.execute(`UPDATE ${T.group} SET "name" = $2, "nameKh" = $3, "required" = $4, "minSelect" = $5, "maxSelect" = $6, "sortOrder" = $7, "active" = $8 WHERE "id" = $1`, [id, g.name, g.nameKh, g.required, g.minSelect, g.maxSelect, g.sortOrder, g.active]);
        if (!r.count) throw fail('NOT_FOUND', 'Add-on group not found');
      }
      const keep = [];
      for (const a of addons) {
        const aid = a.id || newId(); keep.push(aid);
        await tx.execute(`INSERT INTO ${T.addon} ("id", "groupId", "name", "nameKh", "price", "currency", "sortOrder", "active") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "nameKh" = EXCLUDED."nameKh", "price" = EXCLUDED."price", "currency" = EXCLUDED."currency", "sortOrder" = EXCLUDED."sortOrder", "active" = EXCLUDED."active"`,
          [aid, id, a.name, a.nameKh, a.price, a.currency, a.sortOrder, a.active]);
      }
      await tx.execute(`UPDATE ${T.addon} SET "active" = FALSE WHERE "groupId" = $1 AND NOT ("id" = ANY($2::text[]))`, [id, keep]);
    });
    return { id };
  };
  register({ method: 'POST', path: 'addon-groups', permission: PERM.menu, handler: (request) => saveGroup(newId(), request?.body || {}, true) });
  register({ method: 'PUT', path: 'addon-groups/:id', permission: PERM.menu, handler: (request) => saveGroup(idOf(request?.params?.id), request?.body || {}, false) });

  // ---------- CSV import: category,name,nameKh,price,currency,sku,barcode (price in dollars or riel) ----------
  register({
    method: 'POST', path: 'menu/import', permission: PERM.menu,
    handler: async (request) => {
      const csv = text(request?.body?.csv, 'CSV', 500000, true);
      const rows = parseCsv(csv);
      if (!rows.length) throw fail('INVALID_VALUE', 'The file has no rows');
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = (name) => header.indexOf(name);
      if (col('name') < 0 || col('price') < 0) throw fail('INVALID_VALUE', 'The first row must name the columns: category, name, nameKh, price, currency, sku, barcode');
      const categories = new Map((await db.query(`SELECT "id", "name" FROM ${T.category}`)).map((c) => [c.name.toLowerCase(), c.id]));
      let created = 0; const problems = [];
      for (const [index, row] of rows.slice(1, 1001).entries()) {
        const value = (name) => (col(name) >= 0 ? String(row[col(name)] || '').trim() : '');
        try {
          if (!value('name')) continue;
          const currency = (value('currency') || 'USD').toUpperCase();
          if (!['USD', 'KHR'].includes(currency)) throw new Error('currency must be USD or KHR');
          const priceText = value('price').replace(/[,$៛\s]/g, '');
          if (!/^\d+(\.\d{1,2})?$/.test(priceText)) throw new Error('price is not a number');
          const price = currency === 'USD' ? Math.round(Number(priceText) * 100) : Math.round(Number(priceText));
          let categoryId = null;
          if (value('category')) {
            categoryId = categories.get(value('category').toLowerCase());
            if (!categoryId) { categoryId = newId(); await db.execute(`INSERT INTO ${T.category} ("id", "name") VALUES ($1, $2)`, [categoryId, value('category').slice(0, 80)]); categories.set(value('category').toLowerCase(), categoryId); }
          }
          await db.execute(`INSERT INTO ${T.product} ("id", "categoryId", "name", "nameKh", "price", "currency", "sku", "barcode") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [newId(), categoryId, value('name').slice(0, 120), value('namekh').slice(0, 120) || null, price, currency, value('sku').slice(0, 60) || null, value('barcode').slice(0, 60) || null]);
          created += 1;
        } catch (error) { problems.push(`Row ${index + 2}: ${error.message}`); }
      }
      return { created, problems: problems.slice(0, 50) };
    },
  });

  // ---------- kitchen stations (which categories each kitchen screen shows) ----------
  const stationBody = (body) => ({
    name: text(body.name, 'Name', 60, true), categoryIds: [...new Set((Array.isArray(body.categoryIds) ? body.categoryIds : []).map((c) => idOf(c, 'categoryId')))].slice(0, 100),
    sortOrder: int(body.sortOrder ?? 0, 'Order', -10000, 10000), active: bool(body.active, true),
  });
  register({ method: 'POST', path: 'stations', permission: PERM.configure, handler: async (request) => { const s = stationBody(request?.body || {}); const id = newId(); await db.execute(`INSERT INTO ${T.station} ("id", "name", "categoryIds", "sortOrder", "active") VALUES ($1, $2, $3::jsonb, $4, $5)`, [id, s.name, JSON.stringify(s.categoryIds), s.sortOrder, s.active]); return { id, ...s }; } });
  register({ method: 'PUT', path: 'stations/:id', permission: PERM.configure, handler: async (request) => { const id = idOf(request?.params?.id); const s = stationBody(request?.body || {}); const r = await db.execute(`UPDATE ${T.station} SET "name" = $2, "categoryIds" = $3::jsonb, "sortOrder" = $4, "active" = $5 WHERE "id" = $1`, [id, s.name, JSON.stringify(s.categoryIds), s.sortOrder, s.active]); if (!r.count) throw fail('NOT_FOUND', 'Station not found'); return { id, ...s }; } });

  // the kitchen screen's station list (kitchen staff may not have the selling permission)
  register({ method: 'GET', path: 'kitchen/stations', permission: PERM.kitchen, handler: async () => (await db.query(`SELECT "id", "name" FROM ${T.station} WHERE "active" = TRUE ORDER BY "sortOrder", "name"`)) });

  // ---------- tables (the floor plan) ----------
  const tableBody = (body) => ({
    name: text(body.name, 'Table name', 30, true), seats: int(body.seats ?? 4, 'Seats', 1, 50), area: optional(body.area, 'Area', 40),
    x: int(body.x ?? 0, 'x', 0, 2000), y: int(body.y ?? 0, 'y', 0, 2000), shape: oneOf(body.shape || 'SQUARE', ['SQUARE', 'ROUND', 'LONG'], 'shape'), active: bool(body.active, true),
  });
  register({ method: 'POST', path: 'tables', permission: PERM.tables, handler: async (request) => { const t = tableBody(request?.body || {}); const id = newId(); await db.execute(`INSERT INTO ${T.table} ("id", "name", "seats", "area", "x", "y", "shape", "active") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, t.name, t.seats, t.area, t.x, t.y, t.shape, t.active]); return { id, ...t }; } });
  register({ method: 'PUT', path: 'tables/:id', permission: PERM.tables, handler: async (request) => { const id = idOf(request?.params?.id); const t = tableBody(request?.body || {}); const r = await db.execute(`UPDATE ${T.table} SET "name" = $2, "seats" = $3, "area" = $4, "x" = $5, "y" = $6, "shape" = $7, "active" = $8 WHERE "id" = $1`, [id, t.name, t.seats, t.area, t.x, t.y, t.shape, t.active]); if (!r.count) throw fail('NOT_FOUND', 'Table not found'); return { id, ...t }; } });
  // the floor plan, with what is happening at each table
  register({
    method: 'GET', path: 'tables', permission: PERM.sell,
    handler: async () => {
      const tables = await db.query(`SELECT * FROM ${T.table} WHERE "active" = TRUE ORDER BY "area" NULLS FIRST, "name"`);
      const open = await db.query(`SELECT o."id", o."tableId", o."number", o."total", o."paid", o."createdAt",
          (SELECT COUNT(*)::int FROM ${T.item} i WHERE i."orderId" = o."id" AND i."status" <> 'VOID') AS "items",
          (SELECT COUNT(*)::int FROM ${T.item} i WHERE i."orderId" = o."id" AND i."status" = 'READY') AS "ready"
        FROM ${T.order} o WHERE o."status" = 'OPEN' AND o."tableId" IS NOT NULL`);
      const byTable = new Map(open.map((o) => [o.tableId, o]));
      return tables.map((t) => {
        const o = byTable.get(t.id);
        return { id: t.id, name: t.name, seats: t.seats, area: t.area || '', x: t.x, y: t.y, shape: t.shape,
          order: o ? { id: o.id, number: o.number, total: Number(o.total), paid: Number(o.paid), items: o.items, ready: o.ready, since: new Date(o.createdAt).toISOString() } : null };
      });
    },
  });

  return { loadMenu };
}

// A small CSV reader: commas, quotes ("" inside quotes), CRLF or LF.
function parseCsv(input) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && input[i + 1] === '\n') i += 1; row.push(field); field = ''; if (row.some((c) => c !== '')) rows.push(row); row = []; }
    else field += ch;
  }
  row.push(field); if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

module.exports = { registerMenu, parseCsv };
