'use strict';

// Orders, payments, refunds, the kitchen display and the customer display.
//
// Prices come from the menu on the server, never from the screen: an order copies each item's name and price
// (in the order's base currency, at the order's exchange rate) so later menu or rate changes never alter it.
// Life cycle: OPEN (being taken; a table's tab, or a held order) → PAID when payments cover the total →
// REFUNDED when fully refunded; VOIDED only while nothing is paid. Items go to the kitchen as NEW → PREPARING
// → READY → SERVED (or VOID). Orders and payments carry a client key so a retried or offline request is
// recorded once. When an order is paid, its recipes take stock and its customer earns points.

const { T, PERM, METHODS, CONTRACT, fail, newId, text, optional, int, oneOf, idOf, iso, businessDate, isoDate, dateOnly } = require('./shared');
const money = require('./money');

function registerOrders(context, { settings, publishDay }) {
  const db = context.database;
  const register = (definition) => context.routes.register({ ...definition, contract: CONTRACT });
  const who = (request) => request?.principal?.userId || null;

  // ---------- reading ----------
  const orderOut = (o, items, payments, refunds, extra = {}) => ({
    id: o.id, number: o.number, businessDate: dateOnly(o.businessDate),
    type: o.type, status: o.status, tableId: o.tableId, customerId: o.customerId, note: o.note || '',
    baseCurrency: o.baseCurrency, rate: o.rate,
    subtotal: Number(o.subtotal), discountType: o.discountType, discountValue: Number(o.discountValue), discount: Number(o.discount),
    serviceCharge: Number(o.serviceCharge), tax: Number(o.tax), taxInclusive: o.taxInclusive, roundOff: Number(o.roundOff),
    total: Number(o.total), paid: Number(o.paid), refunded: Number(o.refunded), due: Math.max(0, Number(o.total) - Number(o.paid)),
    voidReason: o.voidReason || '', createdBy: o.createdBy, createdAt: iso(o.createdAt), paidAt: iso(o.paidAt),
    items: (items || []).map((i) => ({ id: i.id, productId: i.productId, variantId: i.variantId, name: i.name, nameKh: i.nameKh || '', variantName: i.variantName || '',
      addons: Array.isArray(i.addons) ? i.addons : JSON.parse(i.addons || '[]'), unitPrice: Number(i.unitPrice), quantity: i.quantity, lineTotal: Number(i.lineTotal),
      note: i.note || '', status: i.status, voidReason: i.voidReason || '', stationId: i.stationId, createdAt: iso(i.createdAt) })),
    payments: (payments || []).map((p) => ({ id: p.id, method: p.method, amount: Number(p.amount), cashUsd: Number(p.cashUsd), cashKhr: Number(p.cashKhr),
      changeUsd: Number(p.changeUsd), changeKhr: Number(p.changeKhr), reference: p.reference || '', createdAt: iso(p.createdAt), createdBy: p.createdBy })),
    refunds: (refunds || []).map((r) => ({ id: r.id, amount: Number(r.amount), method: r.method, reason: r.reason, createdAt: iso(r.createdAt), createdBy: r.createdBy })),
    ...extra,
  });
  const loadOrder = async (q, id) => {
    const order = (await q.query(`SELECT * FROM ${T.order} WHERE "id" = $1`, [id]))[0];
    if (!order) throw fail('NOT_FOUND', 'Order not found');
    const [items, payments, refunds] = await Promise.all([
      q.query(`SELECT * FROM ${T.item} WHERE "orderId" = $1 ORDER BY "createdAt", "id"`, [id]),
      q.query(`SELECT * FROM ${T.payment} WHERE "orderId" = $1 ORDER BY "createdAt"`, [id]),
      q.query(`SELECT * FROM ${T.refund} WHERE "orderId" = $1 ORDER BY "createdAt"`, [id]),
    ]);
    const extra = {};
    if (order.tableId) extra.table = (await q.query(`SELECT "id", "name" FROM ${T.table} WHERE "id" = $1`, [order.tableId]))[0] || null;
    if (order.customerId) { const c = (await q.query(`SELECT "id", "name", "phone", "points" FROM ${T.customer} WHERE "id" = $1`, [order.customerId]))[0]; extra.customer = c ? { ...c, points: Number(c.points) } : null; }
    return orderOut(order, items, payments, refunds, extra);
  };
  const lockOrder = async (tx, id) => {
    const order = (await tx.query(`SELECT * FROM ${T.order} WHERE "id" = $1 FOR UPDATE`, [id]))[0];
    if (!order) throw fail('NOT_FOUND', 'Order not found');
    return order;
  };

  // ---------- pricing items from the menu ----------
  const priceItems = async (tx, lines, base, rate) => {
    if (!Array.isArray(lines) || !lines.length || lines.length > 200) throw fail('INVALID_VALUE', 'An order needs 1 to 200 items');
    const wanted = lines.map((line) => ({
      productId: idOf(line.productId, 'productId'), variantId: line.variantId ? idOf(line.variantId, 'variantId') : null,
      addonIds: [...new Set((Array.isArray(line.addonIds) ? line.addonIds : []).map((a) => idOf(a, 'addonId')))].slice(0, 30),
      quantity: int(line.quantity ?? 1, 'Quantity', 1, 999), note: optional(line.note, 'Item note', 200),
    }));
    const productIds = [...new Set(wanted.map((w) => w.productId))];
    const products = new Map((await tx.query(`SELECT * FROM ${T.product} WHERE "id" = ANY($1::text[]) AND "active" = TRUE`, [productIds])).map((p) => [p.id, p]));
    const variants = new Map((await tx.query(`SELECT * FROM ${T.variant} WHERE "productId" = ANY($1::text[]) AND "active" = TRUE`, [productIds])).map((v) => [v.id, v]));
    const links = await tx.query(`SELECT "productId", "groupId" FROM ${T.productGroup} WHERE "productId" = ANY($1::text[])`, [productIds]);
    const groupIds = [...new Set(links.map((l) => l.groupId))];
    const groups = new Map((await tx.query(`SELECT * FROM ${T.group} WHERE "id" = ANY($1::text[]) AND "active" = TRUE`, [groupIds])).map((g) => [g.id, g]));
    const addons = new Map((await tx.query(`SELECT * FROM ${T.addon} WHERE "groupId" = ANY($1::text[]) AND "active" = TRUE`, [groupIds])).map((a) => [a.id, a]));
    const stations = (await tx.query(`SELECT "id", "categoryIds" FROM ${T.station} WHERE "active" = TRUE ORDER BY "sortOrder", "name"`));
    const stationFor = (categoryId) => (stations.find((s) => (Array.isArray(s.categoryIds) ? s.categoryIds : JSON.parse(s.categoryIds || '[]')).includes(categoryId)) || {}).id || null;
    return wanted.map((w) => {
      const product = products.get(w.productId);
      if (!product) throw fail('ITEM_UNAVAILABLE', 'An item is no longer on the menu: reload the menu');
      const productVariants = [...variants.values()].filter((v) => v.productId === product.id);
      let variant = null;
      if (w.variantId) { variant = variants.get(w.variantId); if (!variant || variant.productId !== product.id) throw fail('ITEM_UNAVAILABLE', `${product.name}: that size is no longer offered`); }
      else if (productVariants.length) throw fail('ADDONS_INVALID', `${product.name}: choose a size`);
      const linked = links.filter((l) => l.productId === product.id).map((l) => groups.get(l.groupId)).filter(Boolean);
      const chosen = w.addonIds.map((id) => addons.get(id));
      if (chosen.some((a) => !a || !linked.some((g) => g.id === a.groupId))) throw fail('ADDONS_INVALID', `${product.name}: a choice is not offered for this item`);
      for (const group of linked) {
        const count = chosen.filter((a) => a.groupId === group.id).length;
        const min = group.required ? Math.max(1, group.minSelect) : group.minSelect;
        if (count < min) throw fail('ADDONS_INVALID', `${product.name}: choose ${group.name}`);
        if (count > group.maxSelect) throw fail('ADDONS_INVALID', `${product.name}: at most ${group.maxSelect} for ${group.name}`);
      }
      const itemPrice = money.convert(Number(variant ? variant.price : product.price), product.currency, base, rate);
      const addonList = chosen.map((a) => ({ id: a.id, name: a.name, nameKh: a.nameKh || '', price: money.convert(Number(a.price), a.currency, base, rate) }));
      const unitPrice = itemPrice + addonList.reduce((sum, a) => sum + a.price, 0);
      return { product, variant, addons: addonList, unitPrice, quantity: w.quantity, lineTotal: unitPrice * w.quantity, note: w.note, stationId: stationFor(product.categoryId) };
    });
  };
  const insertItems = async (tx, orderId, priced, kitchenOn, userId) => {
    for (const p of priced) {
      // clock_timestamp(): items keep the order they were added in (one transaction shares CURRENT_TIMESTAMP)
      await tx.execute(`INSERT INTO ${T.item} ("id", "orderId", "productId", "variantId", "name", "nameKh", "variantName", "addons", "unitPrice", "quantity", "lineTotal", "taxable", "note", "stationId", "status", "createdBy", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, clock_timestamp())`,
      [newId(), orderId, p.product.id, p.variant ? p.variant.id : null, p.product.name, p.product.nameKh || null, p.variant ? p.variant.name : null, JSON.stringify(p.addons),
        p.unitPrice, p.quantity, p.lineTotal, p.product.taxable, p.note, p.stationId, kitchenOn ? 'NEW' : 'SERVED', userId]);
    }
  };
  // recomputes and stores the order's totals from its items (VOID items excluded)
  const retotal = async (tx, order, config) => {
    const items = await tx.query(`SELECT "lineTotal", "taxable" FROM ${T.item} WHERE "orderId" = $1 AND "status" <> 'VOID'`, [order.id]);
    const totals = money.orderTotals({
      lines: items.map((i) => ({ lineTotal: Number(i.lineTotal), taxable: i.taxable })),
      discount: order.discountType ? { type: order.discountType, value: Number(order.discountValue) } : null,
      serviceRate: order.type === 'DINE_IN' ? config.serviceRate : 0,
      vat: { enabled: config.vatEnabled, rate: config.vatRate, inclusive: config.vatInclusive }, base: order.baseCurrency, khrStep: config.khrStep,
    });
    if (totals.total < Number(order.paid)) throw fail('PAID_MORE_THAN_TOTAL');
    await tx.execute(`UPDATE ${T.order} SET "subtotal" = $2, "discount" = $3, "serviceCharge" = $4, "tax" = $5, "taxInclusive" = $6, "roundOff" = $7, "total" = $8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      [order.id, totals.subtotal, totals.discount, totals.serviceCharge, totals.tax, totals.taxInclusive, totals.roundOff, totals.total]);
    return totals;
  };

  // ---------- creating an order ----------
  register({
    method: 'POST', path: 'orders', permission: PERM.sell,
    handler: async (request) => {
      const body = request?.body || {};
      const config = await settings.read();
      const clientKey = optional(body.clientKey, 'clientKey', 120);
      const type = oneOf(body.type || 'TAKEAWAY', ['TAKEAWAY', 'DINE_IN', 'DELIVERY'], 'type');
      const tableId = body.tableId ? idOf(body.tableId, 'tableId') : null;
      const customerId = body.customerId ? idOf(body.customerId, 'customerId') : null;
      if (type === 'DINE_IN' && !tableId) throw fail('INVALID_VALUE', 'Choose a table for a dine-in order');
      // an offline order keeps the time it was taken (for its business day), within two days
      const takenAt = body.takenAt ? new Date(body.takenAt) : new Date();
      if (Number.isNaN(takenAt.getTime()) || Math.abs(Date.now() - takenAt.getTime()) > 2 * 86400000) throw fail('INVALID_VALUE', 'takenAt is not a recent time');
      const id = await db.transaction(async (tx) => {
        if (clientKey) { const seen = (await tx.query(`SELECT "id" FROM ${T.order} WHERE "clientKey" = $1`, [clientKey]))[0]; if (seen) return seen.id; }
        if (tableId && !(await tx.query(`SELECT 1 FROM ${T.table} WHERE "id" = $1 AND "active" = TRUE`, [tableId])).length) throw fail('NOT_FOUND', 'Table not found');
        if (customerId && !(await tx.query(`SELECT 1 FROM ${T.customer} WHERE "id" = $1`, [customerId])).length) throw fail('NOT_FOUND', 'Customer not found');
        const priced = await priceItems(tx, body.items, config.baseCurrency, config.rate);
        const day = businessDate(takenAt, config.timeZone);
        // the day's next number (the upsert locks the day's row until the order is saved; the platform takes
        // writes through execute and reads through query, so the number is read back)
        await tx.execute(`INSERT INTO ${T.day} ("businessDate", "last") VALUES ($1::date, 1) ON CONFLICT ("businessDate") DO UPDATE SET "last" = ${T.day}."last" + 1`, [day]);
        const number = Number((await tx.query(`SELECT "last" FROM ${T.day} WHERE "businessDate" = $1::date`, [day]))[0].last);
        const orderId = newId();
        await tx.execute(`INSERT INTO ${T.order} ("id", "number", "businessDate", "type", "tableId", "customerId", "note", "baseCurrency", "rate", "clientKey", "createdBy", "createdAt")
          VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)`,
        [orderId, number, day, type, tableId, customerId, optional(body.note, 'Note', 300), config.baseCurrency, config.rate, clientKey, who(request), takenAt.toISOString()]);
        await insertItems(tx, orderId, priced, config.kitchenTickets, who(request));
        await retotal(tx, { id: orderId, type, discountType: null, discountValue: 0, baseCurrency: config.baseCurrency, paid: 0 }, config);
        return orderId;
      });
      return loadOrder(db, id);
    },
  });

  // more items on an open order (a table's next round)
  register({
    method: 'POST', path: 'orders/:id/items', permission: PERM.sell,
    handler: async (request) => {
      const id = idOf(request?.params?.id);
      const config = await settings.read();
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (order.status !== 'OPEN') throw fail('ORDER_NOT_OPEN');
        await insertItems(tx, id, await priceItems(tx, request?.body?.items, order.baseCurrency, order.rate), config.kitchenTickets, who(request));
        await retotal(tx, order, config);
      });
      return loadOrder(db, id);
    },
  });

  // note, customer, or moving the order to another table
  register({
    method: 'PUT', path: 'orders/:id', permission: PERM.sell,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const body = request?.body || {};
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (order.status !== 'OPEN') throw fail('ORDER_NOT_OPEN');
        const next = { note: body.note === undefined ? order.note : optional(body.note, 'Note', 300), customerId: body.customerId === undefined ? order.customerId : (body.customerId ? idOf(body.customerId, 'customerId') : null), tableId: body.tableId === undefined ? order.tableId : (body.tableId ? idOf(body.tableId, 'tableId') : null) };
        if (next.customerId && !(await tx.query(`SELECT 1 FROM ${T.customer} WHERE "id" = $1`, [next.customerId])).length) throw fail('NOT_FOUND', 'Customer not found');
        if (next.tableId && !(await tx.query(`SELECT 1 FROM ${T.table} WHERE "id" = $1 AND "active" = TRUE`, [next.tableId])).length) throw fail('NOT_FOUND', 'Table not found');
        await tx.execute(`UPDATE ${T.order} SET "note" = $2, "customerId" = $3, "tableId" = $4, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, next.note, next.customerId, next.tableId]);
      });
      return loadOrder(db, id);
    },
  });

  // a discount on the whole order (percent in hundredths, or an amount in base minor units)
  register({
    method: 'PUT', path: 'orders/:id/discount', permission: PERM.discount,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const body = request?.body || {};
      const config = await settings.read();
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (order.status !== 'OPEN') throw fail('ORDER_NOT_OPEN');
        const type = body.type ? oneOf(body.type, ['PERCENT', 'AMOUNT'], 'type') : null;
        const value = type ? int(body.value, 'Discount', 0, type === 'PERCENT' ? 10000 : 100000000000) : 0;
        await tx.execute(`UPDATE ${T.order} SET "discountType" = $2, "discountValue" = $3 WHERE "id" = $1`, [id, type, value]);
        await retotal(tx, { ...order, discountType: type, discountValue: value }, config);
      });
      return loadOrder(db, id);
    },
  });

  // removing an item (a mistake, or the guest changed their mind): only on open orders, with a reason
  register({
    method: 'POST', path: 'orders/:id/items/:itemId/void', permission: PERM.void,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const itemId = idOf(request?.params?.itemId, 'itemId');
      const reason = text(request?.body?.reason, 'Reason', 200, true);
      const config = await settings.read();
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (order.status !== 'OPEN') throw fail('ORDER_NOT_OPEN');
        const r = await tx.execute(`UPDATE ${T.item} SET "status" = 'VOID', "voidReason" = $3 WHERE "id" = $2 AND "orderId" = $1 AND "status" <> 'VOID'`, [id, itemId, reason]);
        if (!r.count) throw fail('NOT_FOUND', 'Item not found');
        await retotal(tx, order, config);
      });
      return loadOrder(db, id);
    },
  });

  // cancelling an order nobody has paid for
  register({
    method: 'POST', path: 'orders/:id/void', permission: PERM.void,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const reason = text(request?.body?.reason, 'Reason', 200, true);
      let day;
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        if (order.status !== 'OPEN') throw fail('ORDER_NOT_OPEN');
        if (Number(order.paid) > 0) throw fail('PAID_MORE_THAN_TOTAL', 'Part of this order is paid: refund it instead');
        await tx.execute(`UPDATE ${T.order} SET "status" = 'VOIDED', "voidReason" = $2, "closedBy" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, reason, who(request)]);
        await tx.execute(`UPDATE ${T.item} SET "status" = 'VOID', "voidReason" = COALESCE("voidReason", $2) WHERE "orderId" = $1 AND "status" <> 'VOID'`, [id, reason]);
        day = order.businessDate;
      });
      await publishDay(day);
      return loadOrder(db, id);
    },
  });

  // ---------- paying ----------
  const openSession = async (tx) => (await tx.query(`SELECT * FROM ${T.session} WHERE "status" = 'OPEN' LIMIT 1`))[0] || null;
  // when an order is paid in full: recipes take stock, the customer earns points
  const onPaid = async (tx, order, config, userId) => {
    const items = await tx.query(`SELECT "productId", "variantId", "quantity" FROM ${T.item} WHERE "orderId" = $1 AND "status" <> 'VOID'`, [order.id]);
    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    if (productIds.length) {
      const recipes = await tx.query(`SELECT * FROM ${T.recipe} WHERE "productId" = ANY($1::text[])`, [productIds]);
      const use = new Map();
      for (const item of items) {
        for (const r of recipes.filter((x) => x.productId === item.productId && (!x.variantId || x.variantId === item.variantId))) {
          use.set(r.supplyId, (use.get(r.supplyId) || 0) + Number(r.quantity) * item.quantity);
        }
      }
      for (const [supplyId, quantity] of use) {
        await tx.execute(`UPDATE ${T.supply} SET "quantity" = "quantity" - $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [supplyId, quantity]);
        await tx.execute(`INSERT INTO ${T.stockMove} ("id", "supplyId", "kind", "quantity", "orderId", "createdBy") VALUES ($1, $2, 'USE', $3, $4, $5)`, [newId(), supplyId, -quantity, order.id, userId]);
      }
    }
    if (order.customerId && config.loyaltyEnabled && config.loyaltySpend > 0) {
      // points on what was paid other than with points
      const paidOther = Number((await tx.query(`SELECT COALESCE(SUM("amount"), 0)::bigint AS "sum" FROM ${T.payment} WHERE "orderId" = $1 AND "method" <> 'LOYALTY'`, [order.id]))[0].sum);
      const points = Math.floor(paidOther / config.loyaltySpend);
      if (points > 0) {
        await tx.execute(`UPDATE ${T.customer} SET "points" = "points" + $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [order.customerId, points]);
        await tx.execute(`INSERT INTO ${T.loyalty} ("id", "customerId", "orderId", "kind", "points") VALUES ($1, $2, $3, 'EARN', $4)`, [newId(), order.customerId, order.id, points]);
      }
    }
  };
  const markPaidIfDone = async (tx, order, config, userId) => {
    const fresh = (await tx.query(`SELECT * FROM ${T.order} WHERE "id" = $1`, [order.id]))[0];
    if (Number(fresh.paid) >= Number(fresh.total)) {
      await tx.execute(`UPDATE ${T.order} SET "status" = 'PAID', "paidAt" = CURRENT_TIMESTAMP, "closedBy" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [order.id, userId]);
      await onPaid(tx, fresh, config, userId);
      return true;
    }
    return false;
  };
  register({
    method: 'POST', path: 'orders/:id/payments', permission: PERM.sell,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const body = request?.body || {};
      const config = await settings.read();
      const clientKey = optional(body.clientKey, 'clientKey', 120);
      const method = oneOf(body.method, METHODS, 'method');
      let change = { changeUsd: 0, changeKhr: 0 }, day;
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        day = order.businessDate;
        if (clientKey && (await tx.query(`SELECT 1 FROM ${T.payment} WHERE "clientKey" = $1`, [clientKey])).length) return; // already recorded
        if (order.status !== 'OPEN') throw fail('ORDER_NOT_OPEN');
        const due = Number(order.total) - Number(order.paid);
        if (due <= 0) throw fail('NOTHING_DUE');
        const rate = order.rate, base = order.baseCurrency;
        let amount, cashUsd = 0, cashKhr = 0, sessionId = null;
        if (method === 'CASH') {
          const session = await openSession(tx);
          if (!session) throw fail('CASH_SHIFT_REQUIRED');
          sessionId = session.id;
          cashUsd = int(body.cashUsd ?? 0, 'Dollars given', 0, 100000000); cashKhr = int(body.cashKhr ?? 0, 'Riel given', 0, 10000000000);
          if (!cashUsd && !cashKhr) throw fail('INVALID_VALUE', 'Enter the cash given');
          const tender = money.cashTender({ due, usd: cashUsd, khr: cashKhr, base, rate, khrStep: config.khrStep });
          amount = tender.amount; change = { changeUsd: tender.changeUsd, changeKhr: tender.changeKhr };
          if (amount <= 0) throw fail('INVALID_VALUE', 'Enter the cash given');
        } else {
          amount = body.amount === undefined ? due : int(body.amount, 'Amount', 1, due);
          if (method === 'LOYALTY') {
            if (!order.customerId) throw fail('CUSTOMER_REQUIRED');
            if (!config.loyaltyEnabled || !config.loyaltyPointValue) throw fail('INVALID_VALUE', 'Points cannot be used to pay in this shop');
            const points = Math.ceil(amount / config.loyaltyPointValue);
            const r = await tx.execute(`UPDATE ${T.customer} SET "points" = "points" - $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "points" >= $2`, [order.customerId, points]);
            if (!r.count) throw fail('NOT_ENOUGH_POINTS');
            await tx.execute(`INSERT INTO ${T.loyalty} ("id", "customerId", "orderId", "kind", "points") VALUES ($1, $2, $3, 'REDEEM', $4)`, [newId(), order.customerId, id, -points]);
          }
        }
        await tx.execute(`INSERT INTO ${T.payment} ("id", "orderId", "method", "amount", "cashUsd", "cashKhr", "changeUsd", "changeKhr", "reference", "sessionId", "clientKey", "createdBy")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [newId(), id, method, amount, cashUsd, cashKhr, change.changeUsd, change.changeKhr, optional(body.reference, 'Reference', 120), sessionId, clientKey, who(request)]);
        await tx.execute(`UPDATE ${T.order} SET "paid" = "paid" + $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, amount]);
        await markPaidIfDone(tx, order, config, who(request));
      });
      await publishDay(day);
      return { ...(await loadOrder(db, id)), change };
    },
  });
  // an order that costs nothing (a full discount, staff meal) is closed without a payment
  register({
    method: 'POST', path: 'orders/:id/close', permission: PERM.sell,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const config = await settings.read(); let day;
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id); day = order.businessDate;
        if (order.status !== 'OPEN') throw fail('ORDER_NOT_OPEN');
        if (Number(order.total) > Number(order.paid)) throw fail('INVALID_VALUE', 'This order still has something to pay');
        if (!(await markPaidIfDone(tx, order, config, who(request)))) throw fail('NOTHING_DUE');
      });
      await publishDay(day);
      return loadOrder(db, id);
    },
  });

  // ---------- refunds ----------
  register({
    method: 'POST', path: 'orders/:id/refunds', permission: PERM.refund,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const body = request?.body || {};
      const reason = text(body.reason, 'Reason', 200, true);
      const method = oneOf(body.method || 'CASH', METHODS.filter((m) => m !== 'LOYALTY'), 'method');
      let day;
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, id); day = order.businessDate;
        if (!['PAID'].includes(order.status) && !(order.status === 'OPEN' && Number(order.paid) > 0)) throw fail('ORDER_NOT_OPEN', 'Only paid orders can be refunded');
        const left = Number(order.paid) - Number(order.refunded);
        const amount = body.amount === undefined ? left : int(body.amount, 'Amount', 1, 100000000000);
        if (amount > left) throw fail('REFUND_TOO_LARGE');
        let sessionId = null, cashUsd = 0, cashKhr = 0;
        if (method === 'CASH') {
          const session = await openSession(tx);
          if (!session) throw fail('CASH_SHIFT_REQUIRED');
          sessionId = session.id;
          // the cash handed back, in the order's currency unless told otherwise
          if (body.cashUsd !== undefined || body.cashKhr !== undefined) { cashUsd = int(body.cashUsd ?? 0, 'Dollars back', 0, 100000000); cashKhr = int(body.cashKhr ?? 0, 'Riel back', 0, 10000000000); }
          else if (order.baseCurrency === 'USD') cashUsd = amount; else cashKhr = amount;
        }
        await tx.execute(`INSERT INTO ${T.refund} ("id", "orderId", "amount", "method", "cashUsd", "cashKhr", "reason", "sessionId", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newId(), id, amount, method, cashUsd, cashKhr, reason, sessionId, who(request)]);
        const refunded = Number(order.refunded) + amount;
        const full = refunded >= Number(order.paid);
        await tx.execute(`UPDATE ${T.order} SET "refunded" = $2, "status" = CASE WHEN $3 THEN 'REFUNDED' ELSE "status" END, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [id, refunded, full]);
        if (full && order.status === 'PAID') {
          // a full refund puts the recipes' stock back and takes back the points earned
          const used = await tx.query(`SELECT "supplyId", SUM("quantity") AS "quantity" FROM ${T.stockMove} WHERE "orderId" = $1 AND "kind" = 'USE' GROUP BY "supplyId"`, [id]);
          for (const u of used) {
            await tx.execute(`UPDATE ${T.supply} SET "quantity" = "quantity" - $2 WHERE "id" = $1`, [u.supplyId, Number(u.quantity)]);
            await tx.execute(`INSERT INTO ${T.stockMove} ("id", "supplyId", "kind", "quantity", "orderId", "note", "createdBy") VALUES ($1, $2, 'RETURN', $3, $4, 'Refund', $5)`, [newId(), u.supplyId, -Number(u.quantity), id, who(request)]);
          }
          const earned = await tx.query(`SELECT "customerId", SUM("points")::int AS "points" FROM ${T.loyalty} WHERE "orderId" = $1 AND "kind" IN ('EARN', 'REDEEM') GROUP BY "customerId"`, [id]);
          for (const e of earned) {
            if (!e.points) continue;
            await tx.execute(`UPDATE ${T.customer} SET "points" = "points" - $2 WHERE "id" = $1`, [e.customerId, e.points]);
            await tx.execute(`INSERT INTO ${T.loyalty} ("id", "customerId", "orderId", "kind", "points", "note") VALUES ($1, $2, $3, 'REVERSE', $4, 'Refund')`, [newId(), e.customerId, id, -e.points]);
          }
        }
      });
      await publishDay(day);
      return loadOrder(db, id);
    },
  });

  // ---------- lists ----------
  register({ method: 'GET', path: 'orders/:id', permission: PERM.sell, handler: (request) => loadOrder(db, idOf(request?.params?.id)) });
  register({
    method: 'GET', path: 'orders', permission: PERM.sell,
    handler: async (request) => {
      const q = request?.query || {}; const config = await settings.read();
      const params = []; const where = [];
      if (q.status === 'OPEN') where.push(`o."status" = 'OPEN'`);
      else {
        params.push(q.date ? isoDate(q.date, 'date') : businessDate(new Date(), config.timeZone)); where.push(`o."businessDate" = $${params.length}::date`);
        if (q.status) { params.push(oneOf(q.status, ['OPEN', 'PAID', 'VOIDED', 'REFUNDED'], 'status')); where.push(`o."status" = $${params.length}`); }
      }
      if (q.number) { params.push(int(q.number, 'number', 1, 100000)); where.push(`o."number" = $${params.length}`); }
      const rows = await db.query(`SELECT o.*, t."name" AS "tableName", c."name" AS "customerName",
          (SELECT COUNT(*)::int FROM ${T.item} i WHERE i."orderId" = o."id" AND i."status" <> 'VOID') AS "items",
          (SELECT string_agg(DISTINCT p."method", ',') FROM ${T.payment} p WHERE p."orderId" = o."id") AS "methods"
        FROM ${T.order} o LEFT JOIN ${T.table} t ON t."id" = o."tableId" LEFT JOIN ${T.customer} c ON c."id" = o."customerId"
        WHERE ${where.join(' AND ')} ORDER BY o."createdAt" DESC LIMIT 500`, params);
      return rows.map((o) => ({ ...orderOut(o), tableName: o.tableName || '', customerName: o.customerName || '', itemCount: o.items, methods: (o.methods || '').split(',').filter(Boolean) }));
    },
  });

  // ---------- the kitchen display ----------
  const KITCHEN_NEXT = { NEW: 'PREPARING', PREPARING: 'READY', READY: 'SERVED' };
  register({
    method: 'GET', path: 'kitchen/tickets', permission: PERM.kitchen,
    handler: async (request) => {
      const stationId = request?.query?.stationId ? idOf(request.query.stationId, 'stationId') : null;
      const params = []; let filter = '';
      if (stationId) { params.push(stationId); filter = `AND (i."stationId" = $1 OR i."stationId" IS NULL)`; }
      const rows = await db.query(`SELECT i.*, o."number", o."type", o."note" AS "orderNote", o."createdAt" AS "orderAt", t."name" AS "tableName"
        FROM ${T.item} i JOIN ${T.order} o ON o."id" = i."orderId" LEFT JOIN ${T.table} t ON t."id" = o."tableId"
        WHERE i."status" IN ('NEW', 'PREPARING', 'READY') AND o."status" IN ('OPEN', 'PAID') AND i."createdAt" > NOW() - INTERVAL '18 hours' ${filter}
        ORDER BY o."createdAt", i."createdAt" LIMIT 600`, params);
      const tickets = new Map();
      for (const r of rows) {
        if (!tickets.has(r.orderId)) tickets.set(r.orderId, { orderId: r.orderId, number: r.number, type: r.type, table: r.tableName || '', note: r.orderNote || '', since: iso(r.orderAt), items: [] });
        tickets.get(r.orderId).items.push({ id: r.id, name: r.name, nameKh: r.nameKh || '', variantName: r.variantName || '', addons: (Array.isArray(r.addons) ? r.addons : JSON.parse(r.addons || '[]')).map((a) => a.nameKh || a.name), quantity: r.quantity, note: r.note || '', status: r.status, since: iso(r.createdAt) });
      }
      return [...tickets.values()];
    },
  });
  register({
    method: 'POST', path: 'kitchen/items/:id/status', permission: PERM.kitchen,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const status = oneOf(request?.body?.status, ['NEW', 'PREPARING', 'READY', 'SERVED'], 'status');
      const r = await db.execute(`UPDATE ${T.item} SET "status" = $2, "readyAt" = CASE WHEN $2 = 'READY' THEN CURRENT_TIMESTAMP ELSE "readyAt" END WHERE "id" = $1 AND "status" <> 'VOID'`, [id, status]);
      if (!r.count) throw fail('NOT_FOUND', 'Item not found');
      return { id, status };
    },
  });
  // one tap moves a whole ticket on (for one station, or all of it)
  register({
    method: 'POST', path: 'kitchen/orders/:id/advance', permission: PERM.kitchen,
    handler: async (request) => {
      const id = idOf(request?.params?.id); const stationId = request?.body?.stationId ? idOf(request.body.stationId, 'stationId') : null;
      const items = await db.query(`SELECT "id", "status" FROM ${T.item} WHERE "orderId" = $1 AND "status" IN ('NEW', 'PREPARING', 'READY') ${stationId ? 'AND ("stationId" = $2 OR "stationId" IS NULL)' : ''}`, stationId ? [id, stationId] : [id]);
      if (!items.length) throw fail('NOT_FOUND', 'Nothing to move on this ticket');
      // the ticket moves to the next step of its slowest item
      const order = ['NEW', 'PREPARING', 'READY'];
      const slowest = order.find((s) => items.some((i) => i.status === s));
      const next = KITCHEN_NEXT[slowest];
      await db.execute(`UPDATE ${T.item} SET "status" = $3, "readyAt" = CASE WHEN $3 = 'READY' THEN CURRENT_TIMESTAMP ELSE "readyAt" END WHERE "id" = ANY($1::text[]) AND "status" = $2`, [items.map((i) => i.id), slowest, next]);
      return { orderId: id, status: next };
    },
  });

  // ---------- the customer display: the counter shows its cart, the display reads it ----------
  register({
    method: 'PUT', path: 'display/:register', permission: PERM.sell,
    handler: async (request) => {
      const registerName = text(request?.params?.register, 'register', 40, true).toLowerCase();
      if (!/^[a-z0-9-]+$/.test(registerName)) throw fail('INVALID_VALUE', 'register is not valid');
      const data = request?.body || {};
      const json = JSON.stringify(data);
      if (json.length > 32000) throw fail('FIELD_TOO_LONG', 'The display data is too large');
      await db.execute(`INSERT INTO ${T.display} ("register", "data", "updatedAt") VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP) ON CONFLICT ("register") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = CURRENT_TIMESTAMP`, [registerName, json]);
      return { ok: true };
    },
  });
  register({
    method: 'GET', path: 'display/:register', permission: PERM.sell,
    handler: async (request) => {
      const registerName = text(request?.params?.register, 'register', 40, true).toLowerCase();
      const row = (await db.query(`SELECT "data", "updatedAt" FROM ${T.display} WHERE "register" = $1`, [registerName]))[0];
      return { data: row ? row.data : {}, updatedAt: row ? iso(row.updatedAt) : null };
    },
  });

  return { loadOrder };
}

module.exports = { registerOrders };
