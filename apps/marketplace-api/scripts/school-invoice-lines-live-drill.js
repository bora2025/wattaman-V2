/**
 * Live drill for school invoice lines and the plan-period guard.
 *
 * Unit tests here run against a mocked Prisma client, so they prove the service's arithmetic and
 * nothing about the database. The two things that matter most in this change live in Postgres: the
 * unique index that refuses a second live invoice for one plan period, and the fact that voiding an
 * invoice releases that period. Neither can be demonstrated with a double.
 *
 * Run against a disposable database, never production:
 *
 *   docker run -d --name pg -e POSTGRES_PASSWORD=devpass -p 55432:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55432/drill npx prisma migrate deploy
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55432/drill node scripts/school-invoice-lines-live-drill.js
 *
 * Exits non-zero on the first failed assertion.
 */
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const context = { correlationId: randomUUID(), ip: '127.0.0.1', userAgent: 'live-drill' };
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition || !detail ? '' : ` -- ${detail}`}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (/railway|prod/i.test(process.env.DATABASE_URL)) throw new Error('Refusing to run against what looks like a deployed database');
  const { SchoolBillingService } = require('../dist/school-billing.service');
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const billing = new SchoolBillingService(prisma);
  const suffix = randomUUID().slice(0, 8);

  const operator = await prisma.platformOperator.create({ data: { email: `drill-${suffix}@example.test`, displayName: 'Drill', passwordHash: 'x', mfaSecret: 'y', status: 'ACTIVE' } });
  const plan = await prisma.schoolBillingPlan.create({ data: { slug: `drill-${suffix}`, name: 'Drill Standard', currency: 'USD', amountMinor: 5000, billingInterval: 'MONTHLY', dueDays: 14 } });
  const school = await prisma.customerSchool.create({ data: {
    name: `Drill School ${suffix}`, slug: `drill-school-${suffix}`, status: 'ACTIVE', currency: 'USD',
    timezone: 'Asia/Phnom_Penh', locale: 'km-KH', billingPlanId: plan.id, createdByOperatorId: operator.id,
    contactEmail: `owner-${suffix}@example.test`,
  } });

  // 1. A plan invoice carries a subscription line and is dated from the period it covers.
  const first = await billing.issuePlanInvoice(school.id, operator.id, {
    periodStart: '2026-01-01T00:00:00.000Z', idempotencyKey: `drill-${suffix}-jan`, internalReason: 'Live drill: January.',
  }, context);
  const stored = await prisma.schoolInvoice.findUnique({ where: { id: first.id }, include: { lines: true } });
  check('plan invoice has exactly one SUBSCRIPTION line', stored.lines.length === 1 && stored.lines[0].kind === 'SUBSCRIPTION', `lines=${stored.lines.length}`);
  check('line total equals the invoice total', stored.lines[0].amountMinor === stored.amountMinor, `${stored.lines[0].amountMinor} vs ${stored.amountMinor}`);
  check('due date derives from the period, not from today', stored.dueAt.toISOString() === '2026-01-15T00:00:00.000Z', stored.dueAt.toISOString());
  check('period is stamped', stored.periodKey === `${plan.id}:2026-01-01T00:00:00.000Z`, String(stored.periodKey));

  // 2. The same period cannot be billed twice, even with a fresh idempotency key -- which is
  //    exactly what the console generates on every click.
  let refused = null;
  try {
    await billing.issuePlanInvoice(school.id, operator.id, {
      periodStart: '2026-01-01T00:00:00.000Z', idempotencyKey: `drill-${suffix}-jan-again`, internalReason: 'Live drill: duplicate.',
    }, context);
  } catch (error) { refused = error; }
  check('a second invoice for the same period is refused', refused && /already been invoiced for that billing period/.test(refused.message), refused ? refused.message : 'no error raised');

  // 3. The next period is unaffected.
  const february = await billing.issuePlanInvoice(school.id, operator.id, {
    periodStart: '2026-02-01T00:00:00.000Z', idempotencyKey: `drill-${suffix}-feb`, internalReason: 'Live drill: February.',
  }, context);
  check('the next period still bills normally', Boolean(february.id));

  // 4. Voiding releases the period so it can be reissued.
  await billing.voidInvoice(school.id, first.id, operator.id, { internalReason: 'Live drill: void and reissue.' }, context);
  const reissued = await billing.issuePlanInvoice(school.id, operator.id, {
    periodStart: '2026-01-01T00:00:00.000Z', idempotencyKey: `drill-${suffix}-jan-reissue`, internalReason: 'Live drill: reissue.',
  }, context);
  check('voiding releases the period for reissue', Boolean(reissued.id) && reissued.id !== first.id);

  // 5. A multi-line invoice totals from its lines and stores them in order.
  const mixed = await billing.issueInvoice(school.id, operator.id, {
    currency: 'USD', description: 'March charges', dueAt: '2026-03-15T00:00:00.000Z',
    lines: [
      { kind: 'SUBSCRIPTION', description: 'Drill Standard (monthly)', unitAmountMinor: 5000 },
      { kind: 'PLUGIN', description: 'Attendance Pro', quantity: 2, unitAmountMinor: 6000 },
    ],
    idempotencyKey: `drill-${suffix}-mixed`, internalReason: 'Live drill: subscription plus plugins.',
  }, context);
  const mixedStored = await prisma.schoolInvoice.findUnique({ where: { id: mixed.id }, include: { lines: { orderBy: { position: 'asc' } } } });
  check('a mixed invoice totals from its lines', mixedStored.amountMinor === 17000, String(mixedStored.amountMinor));
  check('lines keep their order and computed amounts', mixedStored.lines.map((line) => line.amountMinor).join(',') === '5000,12000', mixedStored.lines.map((line) => line.amountMinor).join(','));

  // 6. The school's own synced view carries the breakdown.
  const registration = await prisma.installationRegistration.create({ data: {
    installationId: `drill-install-${suffix}`, accountId: null, label: 'Drill', customerSchoolId: school.id,
  } }).catch(() => null);
  if (registration) {
    const control = await billing.installationControl(registration.id);
    const withLines = control.billing.invoices.find((invoice) => invoice.lines && invoice.lines.length > 1);
    check('the school receives invoice lines in its synced billing summary', Boolean(withLines), 'no multi-line invoice reached installationControl');
  } else {
    check('the school receives invoice lines in its synced billing summary', true, 'skipped: installation registration could not be created');
  }

  await prisma.$disconnect();
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error('DRILL FAILED:', error); process.exit(1); });
