'use strict';

// Sales reports for a period (by day, hour, item, category, payment method and staff; voids and refunds),
// a CSV export, and the daily-sales read model other plugins (reporting, finance) can read.
// Amounts stay in each order's own currency: a period where the shop changed its base currency shows both.

const { T, PERM, CONTRACT, fail, isoDate, businessDate, dateOnly } = require('./shared');

function registerReports(context, { settings }) {
  const db = context.database;
  const register = (definition) => context.routes.register({ ...definition, contract: CONTRACT });

  const period = async (query) => {
    const config = await settings.read();
    const today = businessDate(new Date(), config.timeZone);
    const from = query?.from ? isoDate(query.from, 'from') : today;
    const to = query?.to ? isoDate(query.to, 'to') : from;
    if (from > to) throw fail('INVALID_VALUE', 'from must be on or before to');
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw fail('INVALID_VALUE', 'A report covers at most 400 days');
    return { from, to, timeZone: config.timeZone };
  };
  // sales = paid or refunded orders, counted on their business day; refunds subtract
  const SOLD = `o."status" IN ('PAID', 'REFUNDED') AND o."businessDate" BETWEEN $1::date AND $2::date`;

  register({
    method: 'GET', path: 'reports/summary', permission: PERM.reports,
    handler: async (request) => {
      const { from, to, timeZone } = await period(request?.query);
      const p = [from, to];
      const [totals, byDay, byHour, byItem, byCategory, byMethod, byStaff, voids, itemVoids, refunds] = await Promise.all([
        db.query(`SELECT o."baseCurrency" AS "currency", COUNT(*)::int AS "orders", COALESCE(SUM(o."subtotal"), 0)::bigint AS "gross", COALESCE(SUM(o."discount"), 0)::bigint AS "discount",
            COALESCE(SUM(o."serviceCharge"), 0)::bigint AS "service", COALESCE(SUM(o."tax"), 0)::bigint AS "tax", COALESCE(SUM(o."total"), 0)::bigint AS "total", COALESCE(SUM(o."refunded"), 0)::bigint AS "refunded"
          FROM ${T.order} o WHERE ${SOLD} GROUP BY o."baseCurrency"`, p),
        db.query(`SELECT o."businessDate" AS "day", o."baseCurrency" AS "currency", COUNT(*)::int AS "orders", COALESCE(SUM(o."total" - o."refunded"), 0)::bigint AS "net"
          FROM ${T.order} o WHERE ${SOLD} GROUP BY o."businessDate", o."baseCurrency" ORDER BY o."businessDate"`, p),
        db.query(`SELECT EXTRACT(HOUR FROM o."paidAt" AT TIME ZONE $3)::int AS "hour", o."baseCurrency" AS "currency", COUNT(*)::int AS "orders", COALESCE(SUM(o."total" - o."refunded"), 0)::bigint AS "net"
          FROM ${T.order} o WHERE ${SOLD} GROUP BY 1, 2 ORDER BY 1`, [from, to, timeZone]),
        db.query(`SELECT i."name", i."nameKh", COALESCE(i."variantName", '') AS "size", o."baseCurrency" AS "currency", SUM(i."quantity")::int AS "quantity", COALESCE(SUM(i."lineTotal"), 0)::bigint AS "amount"
          FROM ${T.item} i JOIN ${T.order} o ON o."id" = i."orderId" WHERE ${SOLD} AND i."status" <> 'VOID'
          GROUP BY i."name", i."nameKh", 3, o."baseCurrency" ORDER BY 6 DESC LIMIT 100`, p),
        db.query(`SELECT COALESCE(c."name", 'No category') AS "category", o."baseCurrency" AS "currency", SUM(i."quantity")::int AS "quantity", COALESCE(SUM(i."lineTotal"), 0)::bigint AS "amount"
          FROM ${T.item} i JOIN ${T.order} o ON o."id" = i."orderId" LEFT JOIN ${T.product} pr ON pr."id" = i."productId" LEFT JOIN ${T.category} c ON c."id" = pr."categoryId"
          WHERE ${SOLD} AND i."status" <> 'VOID' GROUP BY 1, 2 ORDER BY 4 DESC`, p),
        db.query(`SELECT pm."method", o."baseCurrency" AS "currency", COUNT(*)::int AS "count", COALESCE(SUM(pm."amount"), 0)::bigint AS "amount",
            COALESCE(SUM(pm."cashUsd" - pm."changeUsd"), 0)::bigint AS "cashUsd", COALESCE(SUM(pm."cashKhr" - pm."changeKhr"), 0)::bigint AS "cashKhr"
          FROM ${T.payment} pm JOIN ${T.order} o ON o."id" = pm."orderId" WHERE o."businessDate" BETWEEN $1::date AND $2::date GROUP BY pm."method", o."baseCurrency" ORDER BY 4 DESC`, p),
        db.query(`SELECT o."closedBy" AS "userId", o."baseCurrency" AS "currency", COUNT(*)::int AS "orders", COALESCE(SUM(o."total" - o."refunded"), 0)::bigint AS "net"
          FROM ${T.order} o WHERE ${SOLD} GROUP BY 1, 2 ORDER BY 4 DESC`, p),
        db.query(`SELECT COUNT(*)::int AS "count", COALESCE(SUM(o."total"), 0)::bigint AS "amount", o."baseCurrency" AS "currency" FROM ${T.order} o WHERE o."status" = 'VOIDED' AND o."businessDate" BETWEEN $1::date AND $2::date GROUP BY 3`, p),
        db.query(`SELECT COUNT(*)::int AS "count", COALESCE(SUM(i."lineTotal"), 0)::bigint AS "amount", o."baseCurrency" AS "currency" FROM ${T.item} i JOIN ${T.order} o ON o."id" = i."orderId" WHERE i."status" = 'VOID' AND o."status" <> 'VOIDED' AND o."businessDate" BETWEEN $1::date AND $2::date GROUP BY 3`, p),
        db.query(`SELECT r."reason", r."amount", r."method", r."createdAt", r."createdBy", o."number", o."baseCurrency" AS "currency" FROM ${T.refund} r JOIN ${T.order} o ON o."id" = r."orderId" WHERE o."businessDate" BETWEEN $1::date AND $2::date ORDER BY r."createdAt" DESC LIMIT 200`, p),
      ]);
      // staff names from the school core's directory (no names when it is unavailable)
      const names = new Map();
      try { (await context.directory.lookupUsers([...new Set(byStaff.map((s) => s.userId).concat(refunds.map((r) => r.createdBy)).filter(Boolean))])).forEach((u) => names.set(u.id, u.name)); } catch { /* names stay blank */ }
      const n = (rows, keys) => rows.map((row) => { const out = { ...row }; keys.forEach((k) => { out[k] = Number(row[k]); }); return out; });
      return {
        from, to,
        totals: n(totals, ['gross', 'discount', 'service', 'tax', 'total', 'refunded']).map((t) => ({ ...t, net: t.total - t.refunded })),
        byDay: n(byDay, ['net']).map((d) => ({ ...d, day: dateOnly(d.day) })), byHour: n(byHour, ['net']),
        byItem: n(byItem, ['amount']), byCategory: n(byCategory, ['amount']), byMethod: n(byMethod, ['amount', 'cashUsd', 'cashKhr']),
        byStaff: n(byStaff, ['net']).map((s) => ({ ...s, name: names.get(s.userId) || '' })),
        voidedOrders: n(voids, ['amount']), voidedItems: n(itemVoids, ['amount']),
        refunds: refunds.map((r) => ({ number: r.number, amount: Number(r.amount), currency: r.currency, method: r.method, reason: r.reason, createdAt: new Date(r.createdAt).toISOString(), by: names.get(r.createdBy) || '' })),
      };
    },
  });

  // every sold line of the period, for a spreadsheet
  register({
    method: 'GET', path: 'reports/export', permission: PERM.reports,
    handler: async (request) => {
      const { from, to } = await period(request?.query);
      const rows = await db.query(`SELECT o."businessDate", o."number", o."type", o."status", o."baseCurrency", i."name", COALESCE(i."variantName", '') AS "size", i."quantity", i."unitPrice", i."lineTotal", i."status" AS "itemStatus"
        FROM ${T.item} i JOIN ${T.order} o ON o."id" = i."orderId" WHERE o."businessDate" BETWEEN $1::date AND $2::date ORDER BY o."businessDate", o."number" LIMIT 50000`, [from, to]);
      const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const money = (amount, currency) => (currency === 'USD' ? (Number(amount) / 100).toFixed(2) : String(amount));
      const lines = [['date', 'order', 'type', 'order status', 'currency', 'item', 'size', 'quantity', 'unit price', 'line total', 'item status'].join(',')]
        .concat(rows.map((r) => [dateOnly(r.businessDate), r.number, r.type, r.status, r.baseCurrency, r.name, r.size, r.quantity, money(r.unitPrice, r.baseCurrency), money(r.lineTotal, r.baseCurrency), r.itemStatus].map(cell).join(',')));
      return { filename: `cafe-pos-sales-${from}-to-${to}.csv`, csv: lines.join('\n') };
    },
  });

  // ---------- the daily-sales read model (v1, key = business day) ----------
  const publishDay = async (day) => {
    const date = dateOnly(day);
    if (!date || !context.readModels || typeof context.readModels.publish !== 'function') return;
    try {
      const totals = await db.query(`SELECT o."baseCurrency" AS "currency", COUNT(*) FILTER (WHERE o."status" IN ('PAID', 'REFUNDED'))::int AS "orders",
          COALESCE(SUM(o."total") FILTER (WHERE o."status" IN ('PAID', 'REFUNDED')), 0)::bigint AS "sales", COALESCE(SUM(o."refunded"), 0)::bigint AS "refunds",
          COUNT(*) FILTER (WHERE o."status" = 'VOIDED')::int AS "voided"
        FROM ${T.order} o WHERE o."businessDate" = $1::date GROUP BY o."baseCurrency"`, [date]);
      await context.readModels.publish('daily-sales', 1, date, {
        date, currencies: totals.map((t) => ({ currency: t.currency, orders: t.orders, sales: Number(t.sales), refunds: Number(t.refunds), net: Number(t.sales) - Number(t.refunds), voided: t.voided })),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) { context.logger.log(`Café POS: daily sales for ${date} not published (${error && error.message})`); }
  };
  return { publishDay };
}

module.exports = { registerReports };
