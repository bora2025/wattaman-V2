/**
 * Live drill for manual bank payment: the accounts Wattanam receives money into, and the account a
 * customer names when submitting a payment for review.
 *
 * The unit tests mock Prisma, so they cannot show the parts that live in Postgres: that an account
 * a past submission paid into cannot be deleted (ON DELETE RESTRICT -- archiving is the only way to
 * retire one), and that the whole path from "customer pays into this account" to "finance confirms
 * it and the invoice is paid" works against real rows.
 *
 * Run against a disposable database, never production:
 *
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55435/drill npx prisma migrate deploy
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55435/drill node scripts/school-payment-methods-live-drill.js
 */
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const context = { correlationId: randomUUID(), ip: '127.0.0.1', userAgent: 'live-drill' };
const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]).toString('base64');
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition || !detail ? '' : ` -- ${detail}`}`);
}
async function refused(promise) { try { await promise; return null; } catch (error) { return error; } }

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (/railway|prod/i.test(process.env.DATABASE_URL)) throw new Error('Refusing to run against what looks like a deployed database');
  const { SchoolBillingService } = require('../dist/school-billing.service');
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const billing = new SchoolBillingService(prisma);
  const suffix = randomUUID().slice(0, 8);

  const operator = await prisma.platformOperator.create({ data: { email: `pay-${suffix}@example.test`, displayName: 'Payment drill', passwordHash: 'x', mfaSecret: 'y', status: 'ACTIVE' } });
  const account = await prisma.marketplaceAccount.create({ data: { email: `payer-${suffix}@example.test`, displayName: 'Payment drill customer', passwordHash: 'x' } });
  const usdSchool = await prisma.customerSchool.create({ data: { name: `USD School ${suffix}`, slug: `usd-${suffix}`, status: 'ACTIVE', currency: 'USD', timezone: 'Asia/Phnom_Penh', locale: 'km-KH', createdByOperatorId: operator.id } });
  const khrSchool = await prisma.customerSchool.create({ data: { name: `KHR School ${suffix}`, slug: `khr-${suffix}`, status: 'ACTIVE', currency: 'KHR', timezone: 'Asia/Phnom_Penh', locale: 'km-KH', createdByOperatorId: operator.id } });
  const usdRegistration = await prisma.installationRegistration.create({ data: { installationId: `usd-install-${suffix}`, accountId: account.id, label: 'USD', customerSchoolId: usdSchool.id } });
  await prisma.installationRegistration.create({ data: { installationId: `khr-install-${suffix}`, accountId: account.id, label: 'KHR', customerSchoolId: khrSchool.id } });

  // 1. The operator sets up where money is received.
  const usd = await billing.createPaymentMethod(operator.id, { label: 'ABA Bank (USD)', bankName: 'ABA Bank', accountName: 'Wattanam Co., Ltd.', accountNumber: '000 123 456', currency: 'USD', qrImage: PNG, instructions: 'Put the invoice number in the transfer remark.', internalReason: 'Live drill: USD account.' }, context);
  const khr = await billing.createPaymentMethod(operator.id, { label: 'ACLEDA (KHR)', bankName: 'ACLEDA Bank', accountName: 'Wattanam Co., Ltd.', accountNumber: '1234-5678-90', currency: 'KHR', internalReason: 'Live drill: KHR account.' }, context);
  const archived = await billing.createPaymentMethod(operator.id, { label: 'Old USD account', bankName: 'Old Bank', accountName: 'Wattanam Co., Ltd.', accountNumber: '999 999 999', currency: 'USD', internalReason: 'Live drill: to be archived.' }, context);
  await billing.updatePaymentMethod(archived.id, operator.id, { active: false, internalReason: 'Live drill: closed.' }, context);
  const audit = await prisma.platformAuditEvent.findFirst({ where: { action: 'school_payment_method_created', targetId: usd.id } });
  check('the account creation is audited against the account, by QR hash', audit && audit.targetType === 'SchoolPaymentMethod' && typeof audit.metadata.qrImageSha256 === 'string' && !JSON.stringify(audit.metadata).includes('base64'), audit ? JSON.stringify(audit.metadata).slice(0, 120) : 'no audit row');

  // 2. Each school sees the active accounts in its own currency, QR included.
  const invoice = await billing.issueInvoice(usdSchool.id, operator.id, { currency: 'USD', amountMinor: 17000, description: 'September charges', dueAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), idempotencyKey: `pay-${suffix}-invoice`, internalReason: 'Live drill: invoice.' }, context);
  const view = await billing.customerBilling(account.id);
  const usdView = view.find((school) => school.schoolId === usdSchool.id);
  const khrView = view.find((school) => school.schoolId === khrSchool.id);
  check('the USD school sees only its active USD account', usdView && usdView.paymentMethods.map((m) => m.id).join() === usd.id, usdView ? usdView.paymentMethods.map((m) => m.label).join(', ') : 'no view');
  check('and its QR code, to scan', usdView && usdView.paymentMethods[0] && usdView.paymentMethods[0].qrImage === PNG);
  check('the KHR school sees only its KHR account', khrView && khrView.paymentMethods.map((m) => m.id).join() === khr.id, khrView ? khrView.paymentMethods.map((m) => m.label).join(', ') : 'no view');

  // 3. The school's own synced summary carries the same accounts.
  const control = await billing.installationControl(usdRegistration.id);
  check('the school receives its payment accounts in the synced summary', control.billing.paymentMethods.map((m) => m.id).join() === usd.id);

  // 4. Submissions into the wrong account are refused; a good one is recorded with its receipt.
  const archivedTry = await refused(billing.submitPayment(account.id, { invoiceId: invoice.id, provider: 'bank-transfer', providerReference: `OLD-${suffix}`, amountMinor: 17000, paymentMethodId: archived.id }));
  check('paying into an archived account is refused', archivedTry && /no longer accepting payments/.test(archivedTry.message), archivedTry ? archivedTry.message : 'accepted');
  const wrongCurrency = await refused(billing.submitPayment(account.id, { invoiceId: invoice.id, provider: 'bank-transfer', providerReference: `KHR-${suffix}`, amountMinor: 17000, paymentMethodId: khr.id }));
  check('paying a USD invoice into a KHR account is refused', wrongCurrency && /takes KHR; this invoice is in USD/.test(wrongCurrency.message), wrongCurrency ? wrongCurrency.message : 'accepted');
  const submission = await billing.submitPayment(account.id, { invoiceId: invoice.id, provider: 'bank-transfer', providerReference: `ABA-${suffix}`, amountMinor: 17000, paymentMethodId: usd.id, receiptImage: PNG });
  check('the submission does not echo the receipt back', submission.receiptImage === undefined);
  const stored = await prisma.schoolPaymentSubmission.findUnique({ where: { id: submission.id } });
  check('the submission records the account and the receipt', stored.paymentMethodId === usd.id && stored.receiptImage === PNG);

  // 5. Finance sees which account and the receipt, confirms receipt, and the invoice is paid.
  const reviewer = await billing.billing(usdSchool.id);
  const pending = reviewer.invoices.flatMap((inv) => inv.paymentSubmissions).find((item) => item.id === submission.id);
  check('the reviewer sees which account was paid, and the receipt', pending && pending.paymentMethod && pending.paymentMethod.accountNumber === '000 123 456' && pending.receiptImage === PNG);
  await billing.decidePaymentSubmission(usdSchool.id, submission.id, operator.id, true, { internalReason: 'Live drill: seen on the ABA statement.' }, context);
  const paid = await prisma.schoolInvoice.findUnique({ where: { id: invoice.id } });
  check('confirming receipt pays the invoice', paid.status === 'PAID' && paid.paidMinor === 17000, `${paid.status} ${paid.paidMinor}`);

  // 6. An account a payment went into cannot be deleted -- only archived.
  const deletion = await refused(prisma.schoolPaymentMethod.delete({ where: { id: usd.id } }));
  check('an account with payments against it cannot be deleted', deletion !== null, 'delete succeeded');

  await prisma.$disconnect();
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error('DRILL FAILED:', error); process.exit(1); });
