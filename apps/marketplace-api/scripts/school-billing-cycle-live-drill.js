/**
 * Live drill for the recurring subscription billing run.
 *
 * The unit tests prove the period arithmetic against a mocked Prisma client. What they cannot prove
 * is the property the whole design rests on: that running the cycle repeatedly, across a restart,
 * or from two replicas at once, bills each period exactly once. That is enforced by a unique index
 * in Postgres, so it can only be demonstrated against Postgres.
 *
 * Run against a disposable database, never production:
 *
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55432/drill npx prisma migrate deploy
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55432/drill node scripts/school-billing-cycle-live-drill.js
 */
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition || !detail ? '' : ` -- ${detail}`}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (/railway|prod/i.test(process.env.DATABASE_URL)) throw new Error('Refusing to run against what looks like a deployed database');
  const { SchoolBillingService } = require('../dist/school-billing.service');
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const billing = new SchoolBillingService(prisma);
  const suffix = randomUUID().slice(0, 8);

  const operator = await prisma.platformOperator.create({ data: { email: `cycle-${suffix}@example.test`, displayName: 'Cycle drill', passwordHash: 'x', mfaSecret: 'y', status: 'ACTIVE' } });
  const plan = await prisma.schoolBillingPlan.create({ data: { slug: `cycle-${suffix}`, name: 'Cycle Standard', currency: 'USD', amountMinor: 5000, billingInterval: 'MONTHLY', dueDays: 14 } });
  const anchor = new Date(Date.UTC(2026, 0, 15));
  const school = await prisma.customerSchool.create({ data: {
    name: `Cycle School ${suffix}`, slug: `cycle-school-${suffix}`, status: 'ACTIVE', currency: 'USD',
    timezone: 'Asia/Phnom_Penh', locale: 'km-KH', billingPlanId: plan.id, billingAnchorAt: anchor,
    createdByOperatorId: operator.id, contactEmail: `owner-${suffix}@example.test`,
  } });
  const countInvoices = () => prisma.schoolInvoice.count({ where: { customerSchoolId: school.id } });
  const asOf = new Date(Date.UTC(2026, 2, 20));

  // 1. A first run bills every period that has started: January, February, March.
  const first = await billing.runBillingCycle(asOf);
  check('first run bills every started period', first.issued === 3, `issued=${first.issued}`);
  check('and nothing more', (await countInvoices()) === 3, String(await countInvoices()));

  // 2. Running again changes nothing. This runs hourly and at every boot.
  const second = await billing.runBillingCycle(asOf);
  check('a second run bills nothing new', second.issued === 0 && second.alreadyBilled === 3, `issued=${second.issued} alreadyBilled=${second.alreadyBilled}`);
  check('the invoice count is unchanged', (await countInvoices()) === 3, String(await countInvoices()));

  // 3. Two replicas racing. Without the unique index this is where a school gets billed twice.
  const later = new Date(Date.UTC(2026, 3, 20));
  const racers = await Promise.allSettled([
    billing.runBillingCycle(later),
    billing.runBillingCycle(later),
    billing.runBillingCycle(later),
  ]);
  const aprilCount = await prisma.schoolInvoice.count({ where: { customerSchoolId: school.id, periodKey: `${plan.id}:${new Date(Date.UTC(2026, 3, 15)).toISOString()}` } });
  check('three concurrent runs produce exactly one April invoice', aprilCount === 1, `april invoices=${aprilCount}`);
  check('no concurrent run crashed the process', racers.every((entry) => entry.status === 'fulfilled'), racers.map((entry) => entry.status).join(','));
  check('four periods billed in total', (await countInvoices()) === 4, String(await countInvoices()));

  // 4. What the run raised is attributed to the schedule, not to a person.
  const scheduled = await prisma.schoolInvoice.findMany({ where: { customerSchoolId: school.id }, select: { origin: true, createdByOperatorId: true, lines: { select: { kind: true } } } });
  check('every scheduled invoice is marked SCHEDULED with no operator', scheduled.every((invoice) => invoice.origin === 'SCHEDULED' && invoice.createdByOperatorId === null));
  check('every scheduled invoice carries a subscription line', scheduled.every((invoice) => invoice.lines.length === 1 && invoice.lines[0].kind === 'SUBSCRIPTION'));

  // 5. A suspended school stops accruing: it has already lost the panel where it would see a bill.
  await prisma.customerSchool.update({ where: { id: school.id }, data: { status: 'SUSPENDED' } });
  const suspended = await billing.runBillingCycle(new Date(Date.UTC(2026, 4, 20)));
  check('a suspended school accrues nothing', (await countInvoices()) === 4, `issued=${suspended.issued}`);

  // 6. A school with a plan but no anchor is never billed automatically -- the migration
  //    deliberately backfills no anchors, so this is the state every existing school starts in.
  const unanchored = await prisma.customerSchool.create({ data: {
    name: `Unanchored ${suffix}`, slug: `unanchored-${suffix}`, status: 'ACTIVE', currency: 'USD',
    timezone: 'Asia/Phnom_Penh', locale: 'km-KH', billingPlanId: plan.id, createdByOperatorId: operator.id,
  } });
  await billing.runBillingCycle(new Date(Date.UTC(2026, 4, 20)));
  const unanchoredCount = await prisma.schoolInvoice.count({ where: { customerSchoolId: unanchored.id } });
  check('a school with no anchor is never billed automatically', unanchoredCount === 0, String(unanchoredCount));

  await prisma.$disconnect();
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error('DRILL FAILED:', error); process.exit(1); });
