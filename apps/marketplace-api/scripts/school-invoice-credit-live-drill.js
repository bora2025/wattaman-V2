/**
 * Live drill for buying a plugin on the school's invoice.
 *
 * This is the increment that grants a licence before money arrives, so the drill exercises the
 * whole loop against a real database: buy on account, receive the entitlement, find the charge on
 * the next invoice, pay it, and see the order close. Then the unhappy path -- void the invoice and
 * confirm the licence it paid for is withdrawn.
 *
 * The property most worth proving here cannot be mocked: SchoolInvoiceLine.sourceOrderLineId is
 * unique, so one purchase cannot be billed by two invoices however many billing runs race.
 *
 * Run against a disposable database, never production:
 *
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55432/credit npx prisma migrate deploy
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55432/credit node scripts/school-invoice-credit-live-drill.js
 */
const { PrismaClient } = require('@prisma/client');
const { generateKeyPairSync, randomUUID } = require('node:crypto');

const context = { correlationId: randomUUID(), ip: '127.0.0.1', userAgent: 'live-drill' };
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition || !detail ? '' : ` -- ${detail}`}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (/railway|prod/i.test(process.env.DATABASE_URL)) throw new Error('Refusing to run against what looks like a deployed database');
  const { SchoolBillingService } = require('../dist/school-billing.service');
  const { CommerceService } = require('../dist/commerce.service');
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const config = {
    publicBaseUrl: 'https://marketplace.example',
    entitlementPrivateKey: generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    entitlementKeyId: 'drill-key',
  };
  const billing = new SchoolBillingService(prisma);
  const commerce = new CommerceService(prisma, config);
  const suffix = randomUUID().slice(0, 8);

  const operator = await prisma.platformOperator.create({ data: { email: `credit-${suffix}@example.test`, displayName: 'Credit drill', passwordHash: 'x', mfaSecret: 'y', status: 'ACTIVE' } });
  const plan = await prisma.schoolBillingPlan.create({ data: { slug: `credit-${suffix}`, name: 'Credit Standard', currency: 'USD', amountMinor: 5000, billingInterval: 'MONTHLY', dueDays: 14 } });
  const account = await prisma.marketplaceAccount.create({ data: { email: `buyer-${suffix}@example.test`, displayName: 'Credit drill buyer', passwordHash: 'x' } });
  const school = await prisma.customerSchool.create({ data: {
    name: `Credit School ${suffix}`, slug: `credit-school-${suffix}`, status: 'ACTIVE', currency: 'USD',
    timezone: 'Asia/Phnom_Penh', locale: 'km-KH', billingPlanId: plan.id, billingAnchorAt: new Date(Date.UTC(2026, 0, 15)),
    createdByOperatorId: operator.id, contactEmail: `owner-${suffix}@example.test`,
  } });
  const registration = await prisma.installationRegistration.create({ data: {
    installationId: `credit-install-${suffix}`, accountId: account.id, label: 'Credit drill', customerSchoolId: school.id,
  } });
  const publisher = await prisma.publisher.create({ data: { slug: `pub-${suffix}`, displayName: 'Drill Publisher', status: 'VERIFIED' } });
  const plugin = await prisma.marketplacePlugin.create({ data: { id: `attendance-${suffix}`, name: 'Attendance Pro', description: 'Drill plugin', license: 'commercial', publisherId: publisher.id, isPaid: true, status: 'APPROVED' } });
  const price = await prisma.productPrice.create({ data: { pluginId: plugin.id, currency: 'USD', amountMinor: 12000, licensedMajor: 1, validFrom: new Date('2020-01-01') } });

  // 1. Buy on account: the licence is granted now, before any money has moved.
  const order = await commerce.createOrder({
    accountId: account.id, installationId: registration.id, currency: 'USD', priceIds: [price.id],
    idempotencyKey: `credit-order-${suffix}`, settlementMode: 'INVOICE',
  }, new Date(Date.UTC(2026, 0, 20)));
  const entitlement = await prisma.installationEntitlement.findFirst({ where: { installationId: registration.id, pluginId: plugin.id } });
  check('an invoice-settled purchase grants the entitlement immediately', entitlement && entitlement.status === 'ACTIVE', entitlement ? entitlement.status : 'none');
  const storedOrder = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
  check('the order stays pending, because no money has arrived', storedOrder.status === 'PENDING' && storedOrder.settlementMode === 'INVOICE', `${storedOrder.status}/${storedOrder.settlementMode}`);

  // 2. The charge lands on the next subscription invoice, beside the subscription.
  // Scoped to this school: the run bills every active school in the database, so a shared drill
  // database would make a global count meaningless.
  await billing.runBillingCycle(new Date(Date.UTC(2026, 0, 25)));
  const raised = await prisma.schoolInvoice.count({ where: { customerSchoolId: school.id } });
  check('the billing run raised one invoice for this school', raised === 1, `invoices=${raised}`);
  const invoice = await prisma.schoolInvoice.findFirst({ where: { customerSchoolId: school.id }, include: { lines: { orderBy: { position: 'asc' } } } });
  check('the invoice carries the subscription and the plugin', invoice.lines.map((line) => line.kind).join(',') === 'SUBSCRIPTION,PLUGIN', invoice.lines.map((line) => line.kind).join(','));
  check('the invoice totals both', invoice.amountMinor === 17000, String(invoice.amountMinor));
  check('the plugin line names the purchase it came from', invoice.lines[1].sourceOrderLineId !== null);

  // 3. The next run must not bill the same purchase again.
  const second = await billing.runBillingCycle(new Date(Date.UTC(2026, 1, 20)));
  const februaryInvoice = await prisma.schoolInvoice.findFirst({ where: { customerSchoolId: school.id, periodKey: `${plan.id}:${new Date(Date.UTC(2026, 1, 15)).toISOString()}` }, include: { lines: true } });
  check('February bills the subscription only', februaryInvoice && februaryInvoice.lines.length === 1, februaryInvoice ? String(februaryInvoice.lines.length) : 'no february invoice');
  const pluginLines = await prisma.schoolInvoiceLine.count({ where: { kind: 'PLUGIN', invoice: { customerSchoolId: school.id } } });
  check('a purchase is never billed twice', pluginLines === 1, `plugin lines=${pluginLines}, second run issued=${second.issued}`);

  // 4. Paying the invoice closes the order.
  await billing.recordPayment(school.id, invoice.id, operator.id, {
    provider: 'bank-transfer', providerReference: `drill-${suffix}`, amountMinor: invoice.amountMinor, internalReason: 'Live drill: settlement.',
  }, context);
  const settled = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
  check('paying the invoice marks the order paid', settled.status === 'PAID', settled.status);

  // 5. Voiding an invoice withdraws the licence it granted. A fresh purchase, since the first
  //    invoice is now paid and cannot be voided.
  const order2 = await commerce.createOrder({
    accountId: account.id, installationId: registration.id, currency: 'USD', priceIds: [price.id],
    idempotencyKey: `credit-order2-${suffix}`, settlementMode: 'INVOICE',
  }, new Date(Date.UTC(2026, 2, 2)));
  await billing.runBillingCycle(new Date(Date.UTC(2026, 2, 20)));
  const marchInvoice = await prisma.schoolInvoice.findFirst({ where: { customerSchoolId: school.id, periodKey: `${plan.id}:${new Date(Date.UTC(2026, 2, 15)).toISOString()}` }, include: { lines: true } });
  check('the second purchase reached the March invoice', marchInvoice && marchInvoice.lines.some((line) => line.kind === 'PLUGIN'), 'no plugin line in March');
  await billing.voidInvoice(school.id, marchInvoice.id, operator.id, { internalReason: 'Live drill: void and revoke.' }, context);
  const afterVoid = await prisma.installationEntitlement.findFirst({ where: { orderLineId: (await prisma.marketplaceOrderLine.findFirst({ where: { orderId: order2.id } })).id } });
  check('voiding the invoice revokes the licence it paid for', afterVoid && afterVoid.status === 'REVOKED', afterVoid ? afterVoid.status : 'none');

  // 6. A school billed in another currency cannot put a USD plugin on its invoice.
  const khrSchool = await prisma.customerSchool.create({ data: {
    name: `KHR School ${suffix}`, slug: `khr-school-${suffix}`, status: 'ACTIVE', currency: 'KHR',
    timezone: 'Asia/Phnom_Penh', locale: 'km-KH', billingAnchorAt: new Date(Date.UTC(2026, 0, 15)), createdByOperatorId: operator.id,
    billingPlanId: (await prisma.schoolBillingPlan.create({ data: { slug: `khr-${suffix}`, name: 'KHR Standard', currency: 'KHR', amountMinor: 200000, billingInterval: 'MONTHLY', dueDays: 14 } })).id,
  } });
  const khrRegistration = await prisma.installationRegistration.create({ data: { installationId: `khr-install-${suffix}`, accountId: account.id, label: 'KHR', customerSchoolId: khrSchool.id } });
  let refused = null;
  try {
    await commerce.createOrder({ accountId: account.id, installationId: khrRegistration.id, currency: 'USD', priceIds: [price.id], idempotencyKey: `khr-order-${suffix}`, settlementMode: 'INVOICE' });
  } catch (error) { refused = error; }
  check('a currency mismatch is refused, not converted', refused && /billed in KHR and the price is in USD/.test(refused.message), refused ? refused.message : 'no error raised');

  await prisma.$disconnect();
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error('DRILL FAILED:', error); process.exit(1); });
