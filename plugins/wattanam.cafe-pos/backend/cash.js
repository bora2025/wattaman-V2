'use strict';

// Cash shifts: one drawer open at a time. Opening float, pay-ins and pay-outs, and the close: what should be in
// the drawer (per currency: dollars and riel are counted separately) against what was counted.
//   expected = float + cash taken − change given + pay-ins − pay-outs − cash refunds

const { T, PERM, CONTRACT, fail, newId, text, optional, int, oneOf, idOf, iso } = require('./shared');

function registerCash(context) {
  const db = context.database;
  const register = (definition) => context.routes.register({ ...definition, contract: CONTRACT });
  const who = (request) => request?.principal?.userId || null;
  const amount = (value, label, max) => int(value ?? 0, label, 0, max);

  // what the drawer should hold now (and the shift's sales, by payment method)
  const summary = async (q, session) => {
    const [cash, movements, refunds, byMethod, orders] = await Promise.all([
      q.query(`SELECT COALESCE(SUM("cashUsd" - "changeUsd"), 0)::bigint AS "usd", COALESCE(SUM("cashKhr" - "changeKhr"), 0)::bigint AS "khr" FROM ${T.payment} WHERE "sessionId" = $1`, [session.id]),
      q.query(`SELECT "kind", "currency", COALESCE(SUM("amount"), 0)::bigint AS "amount" FROM ${T.movement} WHERE "sessionId" = $1 GROUP BY "kind", "currency"`, [session.id]),
      q.query(`SELECT COALESCE(SUM("cashUsd"), 0)::bigint AS "usd", COALESCE(SUM("cashKhr"), 0)::bigint AS "khr" FROM ${T.refund} WHERE "sessionId" = $1`, [session.id]),
      q.query(`SELECT p."method", COUNT(*)::int AS "count", COALESCE(SUM(p."amount"), 0)::bigint AS "amount", o."baseCurrency" AS "currency"
        FROM ${T.payment} p JOIN ${T.order} o ON o."id" = p."orderId" WHERE p."createdAt" >= $1 AND ($2::timestamptz IS NULL OR p."createdAt" <= $2) GROUP BY p."method", o."baseCurrency"`, [session.openedAt, session.closedAt]),
      q.query(`SELECT COUNT(*)::int AS "count" FROM ${T.order} WHERE "paidAt" >= $1 AND ($2::timestamptz IS NULL OR "paidAt" <= $2)`, [session.openedAt, session.closedAt]),
    ]);
    const moved = (kind, currency) => Number((movements.find((m) => m.kind === kind && m.currency === currency) || {}).amount || 0);
    const expectedUsd = Number(session.floatUsd) + Number(cash[0].usd) + moved('IN', 'USD') - moved('OUT', 'USD') - Number(refunds[0].usd);
    const expectedKhr = Number(session.floatKhr) + Number(cash[0].khr) + moved('IN', 'KHR') - moved('OUT', 'KHR') - Number(refunds[0].khr);
    return {
      id: session.id, status: session.status, openedBy: session.openedBy, openedAt: iso(session.openedAt), closedBy: session.closedBy, closedAt: iso(session.closedAt),
      floatUsd: Number(session.floatUsd), floatKhr: Number(session.floatKhr),
      cashInUsd: Number(cash[0].usd), cashInKhr: Number(cash[0].khr),
      payInUsd: moved('IN', 'USD'), payInKhr: moved('IN', 'KHR'), payOutUsd: moved('OUT', 'USD'), payOutKhr: moved('OUT', 'KHR'),
      refundUsd: Number(refunds[0].usd), refundKhr: Number(refunds[0].khr),
      expectedUsd, expectedKhr,
      countedUsd: session.countedUsd === null ? null : Number(session.countedUsd), countedKhr: session.countedKhr === null ? null : Number(session.countedKhr),
      differenceUsd: session.countedUsd === null ? null : Number(session.countedUsd) - expectedUsd,
      differenceKhr: session.countedKhr === null ? null : Number(session.countedKhr) - expectedKhr,
      note: session.note || '', orders: orders[0].count,
      byMethod: byMethod.map((m) => ({ method: m.method, currency: m.currency, count: m.count, amount: Number(m.amount) })),
    };
  };

  // the counter asks whether a shift is open (cash payments need one)
  register({
    method: 'GET', path: 'cash/current', permission: PERM.sell,
    handler: async () => {
      const session = (await db.query(`SELECT * FROM ${T.session} WHERE "status" = 'OPEN' LIMIT 1`))[0];
      return { session: session ? await summary(db, session) : null };
    },
  });
  register({
    method: 'POST', path: 'cash/open', permission: PERM.cash,
    handler: async (request) => {
      const body = request?.body || {}; const id = newId();
      try {
        await db.execute(`INSERT INTO ${T.session} ("id", "status", "openedBy", "floatUsd", "floatKhr", "note") VALUES ($1, 'OPEN', $2, $3, $4, $5)`,
          [id, who(request), amount(body.floatUsd, 'Float in dollars', 100000000), amount(body.floatKhr, 'Float in riel', 10000000000), optional(body.note, 'Note', 300)]);
      } catch (error) {
        if (/unique|duplicate|23505|already exists/i.test(`${error && error.code} ${error && error.message}`)) throw fail('CASH_SHIFT_OPEN');
        throw error;
      }
      return summary(db, (await db.query(`SELECT * FROM ${T.session} WHERE "id" = $1`, [id]))[0]);
    },
  });
  register({
    method: 'POST', path: 'cash/movements', permission: PERM.cash,
    handler: async (request) => {
      const body = request?.body || {};
      const session = (await db.query(`SELECT * FROM ${T.session} WHERE "status" = 'OPEN' LIMIT 1`))[0];
      if (!session) throw fail('CASH_SHIFT_REQUIRED');
      const currency = oneOf(body.currency || 'USD', ['USD', 'KHR'], 'currency');
      await db.execute(`INSERT INTO ${T.movement} ("id", "sessionId", "kind", "currency", "amount", "reason", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newId(), session.id, oneOf(body.kind, ['IN', 'OUT'], 'kind'), currency, int(body.amount, 'Amount', 1, currency === 'USD' ? 100000000 : 10000000000), text(body.reason, 'Reason', 200, true), who(request)]);
      return summary(db, session);
    },
  });
  register({
    method: 'POST', path: 'cash/close', permission: PERM.cash,
    handler: async (request) => {
      const body = request?.body || {};
      const id = await db.transaction(async (tx) => {
        const session = (await tx.query(`SELECT * FROM ${T.session} WHERE "status" = 'OPEN' LIMIT 1 FOR UPDATE`))[0];
        if (!session) throw fail('CASH_SHIFT_REQUIRED', 'No cash shift is open');
        const now = new Date();
        const s = await summary(tx, { ...session, closedAt: now });
        await tx.execute(`UPDATE ${T.session} SET "status" = 'CLOSED', "closedBy" = $2, "closedAt" = $3::timestamptz, "countedUsd" = $4, "countedKhr" = $5, "expectedUsd" = $6, "expectedKhr" = $7, "note" = COALESCE($8, "note") WHERE "id" = $1`,
          [session.id, who(request), now.toISOString(), amount(body.countedUsd, 'Counted dollars', 100000000), amount(body.countedKhr, 'Counted riel', 10000000000), s.expectedUsd, s.expectedKhr, optional(body.note, 'Note', 300)]);
        return session.id;
      });
      return summary(db, (await db.query(`SELECT * FROM ${T.session} WHERE "id" = $1`, [id]))[0]);
    },
  });
  register({
    method: 'GET', path: 'cash/sessions', permission: PERM.cash,
    handler: async () => {
      const rows = await db.query(`SELECT * FROM ${T.session} ORDER BY "openedAt" DESC LIMIT 60`);
      return rows.map((s) => ({ id: s.id, status: s.status, openedAt: iso(s.openedAt), closedAt: iso(s.closedAt), openedBy: s.openedBy, closedBy: s.closedBy,
        expectedUsd: s.expectedUsd === null ? null : Number(s.expectedUsd), expectedKhr: s.expectedKhr === null ? null : Number(s.expectedKhr),
        countedUsd: s.countedUsd === null ? null : Number(s.countedUsd), countedKhr: s.countedKhr === null ? null : Number(s.countedKhr) }));
    },
  });
  // the shift report (Z report when closed)
  register({
    method: 'GET', path: 'cash/sessions/:id', permission: PERM.cash,
    handler: async (request) => {
      const session = (await db.query(`SELECT * FROM ${T.session} WHERE "id" = $1`, [idOf(request?.params?.id)]))[0];
      if (!session) throw fail('NOT_FOUND', 'Cash shift not found');
      return summary(db, session);
    },
  });
}

module.exports = { registerCash };
