/**
 * Cross-app live drill: a school reporting a payment from its own admin panel.
 *
 * The school backend signs with its copy of schoolPaymentSignedPayload and the marketplace verifies
 * with its own. If the two ever drift by a single byte, every school submission fails verification
 * in production -- and no unit test in either app can see it, because each only checks itself. This
 * drill signs with the school's real compiled code (backend/dist) and verifies with the marketplace's,
 * then records the submission against a real database.
 *
 * Needs both builds (`npm run build` in apps/marketplace-api and in backend) and a disposable
 * database, never production:
 *
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55435/drill npx prisma migrate deploy
 *   DATABASE_URL=postgresql://postgres:devpass@localhost:55435/drill node scripts/school-payment-from-school-live-drill.js
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { createHash, generateKeyPairSync, randomUUID, sign } = require('node:crypto');

const BACKEND_DIST = path.resolve(__dirname, '../../../backend/dist/marketplace');
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
  const { InstallationEntitlementAccessService } = require('../dist/installation-entitlement-access.service');
  // The school's side, exactly as the school backend ships it.
  const { schoolPaymentSignedPayload: schoolSignedPayload } = require(path.join(BACKEND_DIST, 'school-payment-signing'));
  const { canonicalJson: schoolCanonicalJson } = require(path.join(BACKEND_DIST, 'canonical-json'));
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const billing = new SchoolBillingService(prisma);
  const access = new InstallationEntitlementAccessService(prisma);
  const suffix = randomUUID().slice(0, 8);

  // A school an operator provisioned with an enrollment token: registered and bound, but with no
  // marketplace account -- the case the portal could never serve.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const operator = await prisma.platformOperator.create({ data: { email: `school-pay-${suffix}@example.test`, displayName: 'School payment drill', passwordHash: 'x', mfaSecret: 'y', status: 'ACTIVE' } });
  const school = await prisma.customerSchool.create({ data: { name: `Token School ${suffix}`, slug: `token-school-${suffix}`, status: 'ACTIVE', currency: 'USD', timezone: 'Asia/Phnom_Penh', locale: 'km-KH', createdByOperatorId: operator.id } });
  const installationId = randomUUID();
  const registration = await prisma.installationRegistration.create({ data: {
    installationId, accountId: null, label: 'Token-provisioned', customerSchoolId: school.id,
    keys: { create: { keyFingerprint: createHash('sha256').update(publicKeyPem).digest('hex'), publicKeyPem } },
  } });
  const method = await billing.createPaymentMethod(operator.id, { label: 'ABA Bank (USD)', bankName: 'ABA Bank', accountName: 'Wattanam Co., Ltd.', accountNumber: '000 999 888 777', currency: 'USD', internalReason: 'Live drill: receiving account.' }, context);
  const dueAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const invoice = await billing.issueInvoice(school.id, operator.id, { currency: 'USD', amountMinor: 5000, description: 'Standard (monthly)', dueAt, idempotencyKey: `school-pay-${suffix}-1`, internalReason: 'Live drill: invoice.' }, context);

  // What the school backend sends, built and signed the way SchoolBillingControlService does.
  const submission = { invoiceId: invoice.id, provider: 'bank-transfer', providerReference: `ABA-${suffix}`, amountMinor: 5000, paymentMethodId: method.id, receiptImage: PNG, submittedBy: 'Sokha (SUPER_ADMIN)' };
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(schoolCanonicalJson(schoolSignedPayload(installationId, ts, submission))), privateKeyPem).toString('base64');

  // 1. The marketplace verifies, with its own copy of the payload, what the school signed.
  const authenticated = await refused(access.authenticateSchoolPayment({ installationId, ts, signature }, submission));
  const verified = authenticated === null;
  check("the marketplace verifies exactly what the school's code signed", verified, verified ? '' : authenticated.message);
  const registrationId = verified ? (await access.authenticateSchoolPayment({ installationId, ts, signature }, submission)).registrationId : null;

  // 2. Changing anything the school signed breaks it.
  const tampered = await refused(access.authenticateSchoolPayment({ installationId, ts, signature }, { ...submission, amountMinor: 1 }));
  check('a changed amount breaks the signature', tampered && /Signature is invalid/.test(tampered.message), tampered ? tampered.message : 'accepted');

  // 3. Recorded as sent from the school, with no marketplace account needed.
  const created = await billing.submitPaymentFromSchool(registrationId, submission);
  const stored = await prisma.schoolPaymentSubmission.findUnique({ where: { id: created.id } });
  check('recorded as sent from the school, with no marketplace account', stored.source === 'SCHOOL' && stored.accountId === null && stored.installationRegistrationId === registration.id && stored.submittedBy === 'Sokha (SUPER_ADMIN)', JSON.stringify({ source: stored.source, accountId: stored.accountId }));

  // 4. One transfer reference per invoice.
  const again = await refused(billing.submitPaymentFromSchool(registrationId, submission));
  check('the same reference cannot be reported twice', again && /already submitted/.test(again.message), again ? again.message : 'accepted twice');

  // 5. The school's own synced bill shows it, so the admin sees it went through.
  const control = await billing.installationControl(registration.id);
  const onBill = control.billing.invoices.find((item) => item.id === invoice.id);
  const latest = onBill && onBill.paymentSubmissions && onBill.paymentSubmissions[0];
  check('the school sees the payment awaiting confirmation on its bill', latest && latest.status === 'PENDING' && latest.providerReference === submission.providerReference);

  // 6. Another school's key cannot report against this school's invoice.
  const other = await prisma.customerSchool.create({ data: { name: `Other School ${suffix}`, slug: `other-school-${suffix}`, status: 'ACTIVE', currency: 'USD', timezone: 'Asia/Phnom_Penh', locale: 'km-KH', createdByOperatorId: operator.id } });
  const otherRegistration = await prisma.installationRegistration.create({ data: { installationId: randomUUID(), accountId: null, label: 'Other', customerSchoolId: other.id } });
  const second = await billing.issueInvoice(school.id, operator.id, { currency: 'USD', amountMinor: 5000, description: 'Standard (monthly)', dueAt, idempotencyKey: `school-pay-${suffix}-2`, internalReason: 'Live drill: second invoice.' }, context);
  const crossSchool = await refused(billing.submitPaymentFromSchool(otherRegistration.id, { ...submission, invoiceId: second.id, providerReference: `ABA-X-${suffix}` }));
  check("another school's key cannot report against this invoice", crossSchool && /not found/.test(crossSchool.message), crossSchool ? crossSchool.message : 'accepted');

  // 7. Finance sees where it came from, and confirming it pays the invoice.
  const reviewer = await billing.billing(school.id);
  const forReviewer = reviewer.invoices.flatMap((item) => item.paymentSubmissions).find((item) => item.id === created.id);
  check('finance sees it came from the school, and who sent it', forReviewer && forReviewer.source === 'SCHOOL' && forReviewer.submittedBy === 'Sokha (SUPER_ADMIN)');
  await billing.decidePaymentSubmission(school.id, created.id, operator.id, true, { internalReason: 'Live drill: seen on the ABA statement.' }, context);
  const paid = await prisma.schoolInvoice.findUnique({ where: { id: invoice.id } });
  check('confirming it pays the invoice', paid.status === 'PAID' && paid.paidMinor === 5000, `${paid.status} ${paid.paidMinor}`);

  await prisma.$disconnect();
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error('DRILL FAILED:', error); process.exit(1); });
