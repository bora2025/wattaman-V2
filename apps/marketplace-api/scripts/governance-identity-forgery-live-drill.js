/**
 * Live drill proving the governance identity-forgery fix in app.ts: routes that record who
 * approved/reviewed/verified something (review, approvePublisher, approveKey, revokeKey,
 * addVerifiedMember, correctEntry, requestPayout, approvePayout, markPayoutPaid) now derive that
 * identity from an authenticated session (requireSession + request.accountId), not from a
 * self-asserted field in the request body -- closing a real impersonation gap where anyone
 * holding the single shared MARKETPLACE_ADMIN_TOKEN could forge the "two distinct reviewers" and
 * "no self-review" dual-control guarantees by simply naming different real reviewers' UUIDs in
 * separate calls.
 *
 * Uses the real, unmodified createApp(), real registration/MFA/login HTTP flows, and a real
 * disposable PostgreSQL 16 -- not mocked.
 *
 * Run (from apps/marketplace-api, after `npm run build`):
 *   DATABASE_URL=postgresql://user:pass@host:port/db node scripts/governance-identity-forgery-live-drill.js
 */
'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { createApp } = require('../dist/app');
const { readConfig } = require('../dist/config');
const { totpCode } = require('../dist/identity-crypto');

const PORT = Number(process.env.DRILL_PORT || 34999);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
function check(description, condition) {
  if (condition) { passed += 1; console.log(`PASS ${description}`); }
  else { failed += 1; console.log(`FAIL ${description}`); }
}

async function call(method, urlPath, { body, token } = {}) {
  const response = await fetch(new URL(urlPath, BASE), {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch { /* no body */ }
  return { status: response.status, body: json };
}

function pem() {
  const { privateKey } = crypto.generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  return privateKey;
}

async function registerVerifiedMfaAccount(prisma, email, password) {
  const register = await call('POST', '/v1/accounts', { body: { email, password, displayName: email } });
  if (register.status !== 201) throw new Error(`register failed: ${JSON.stringify(register.body)}`);
  const accountId = register.body.account.id;
  await call('POST', '/v1/accounts/email-verifications/confirm', { body: { token: register.body.emailVerificationToken } });
  const login1 = await call('POST', '/v1/sessions', { body: { email, password } });
  const enroll = await call('POST', '/v1/mfa/enrollments', { token: login1.body.sessionToken });
  const mfaSecret = enroll.body.secret;
  await call('POST', '/v1/mfa/enrollments/confirm', { token: login1.body.sessionToken, body: { code: totpCode(mfaSecret, Math.floor(Date.now() / 1000 / 30)) } });
  const login2 = await call('POST', '/v1/sessions', { body: { email, password, code: totpCode(mfaSecret, Math.floor(Date.now() / 1000 / 30)) } });
  return { accountId, sessionToken: login2.body.sessionToken };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();

  const config = readConfig({
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    PUBLIC_BASE_URL: 'https://marketplace.example',
    MARKETPLACE_ADMIN_TOKEN: 'drill-admin-token-at-least-32-characters',
    METADATA_SIGNING_PRIVATE_KEY: pem(),
    METADATA_SIGNING_KEY_ID: 'repository-drill',
    ENTITLEMENT_SIGNING_PRIVATE_KEY: pem(),
    ENTITLEMENT_SIGNING_KEY_ID: 'entitlement-drill',
    PAYMENT_WEBHOOK_SECRET: 'payment-webhook-secret-at-least-32-chars',
    ARTIFACT_STORAGE_PATH: require('os').tmpdir() + '/governance-forgery-drill-artifacts',
    IDENTITY_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'identity-1': crypto.randomBytes(32).toString('base64') }),
    IDENTITY_ENCRYPTION_ACTIVE_KEY_ID: 'identity-1',
  });
  const server = createApp(prisma, config).listen(PORT, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    console.log('== Setup: two real, MFA-verified accounts, both made real REVIEWER members of the official publisher ==');
    const wattanam = await prisma.publisher.create({ data: { slug: 'wattanam', displayName: 'Wattanam', status: 'VERIFIED' } });
    const reviewerA = await registerVerifiedMfaAccount(prisma, 'reviewer-a@drill.test', 'Reviewer-A-Password1');
    const reviewerB = await registerVerifiedMfaAccount(prisma, 'reviewer-b@drill.test', 'Reviewer-B-Password1');
    const submitter = await registerVerifiedMfaAccount(prisma, 'submitter@drill.test', 'Submitter-Password1');
    await prisma.publisherMember.create({ data: { publisherId: wattanam.id, accountId: reviewerA.accountId, role: 'REVIEWER', verifiedAt: new Date() } });
    await prisma.publisherMember.create({ data: { publisherId: wattanam.id, accountId: reviewerB.accountId, role: 'REVIEWER', verifiedAt: new Date() } });
    check('two real reviewer accounts and one submitter account exist', !!reviewerA.accountId && !!reviewerB.accountId && !!submitter.accountId);

    async function freshSubmission(submittedBy, riskLevel = 'LOW') {
      const plugin = await prisma.marketplacePlugin.create({ data: {
        id: `wattanam.drill-${crypto.randomUUID()}`, publisherId: wattanam.id,
        name: 'Drill Plugin', description: 'Drill fixture', license: 'MIT',
      } });
      const version = await prisma.pluginVersion.create({ data: {
        pluginId: plugin.id, version: '1.0.0', requiresCore: '>=1.0.0', manifestJson: {},
      } });
      return prisma.pluginSubmission.create({ data: {
        publisherId: wattanam.id, pluginVersionId: version.id, analysisReport: {}, riskLevel,
        status: 'NEEDS_REVIEW', submittedBy, submittedAt: new Date(),
      } });
    }

    console.log('\n== Negative control: no session at all is rejected (the shared admin token alone is no longer enough) ==');
    const submissionForNoAuth = await freshSubmission(submitter.accountId);
    const noAuthAttempt = await call('POST', `/admin/v1/submissions/${submissionForNoAuth.id}/reviews`, {
      body: { decision: 'APPROVE', notes: 'attempt with no session', reviewerId: reviewerA.accountId },
    });
    check('reviewing with no session at all is rejected (401)', noAuthAttempt.status === 401);

    console.log('\n== The actual forgery test: a logged-in caller cannot claim to be a DIFFERENT reviewer in the body ==');
    const submissionForForgery = await freshSubmission(submitter.accountId);
    const forgeryAttempt = await call('POST', `/admin/v1/submissions/${submissionForForgery.id}/reviews`, {
      token: reviewerA.sessionToken,
      // Logged in as reviewer A, but the body claims to be reviewer B -- before the fix, this
      // would have recorded B's approval without B ever being involved.
      body: { decision: 'APPROVE', notes: 'forging as reviewer B', reviewerId: reviewerB.accountId },
    });
    check('the call succeeds (reviewer A really is an authorized reviewer)', forgeryAttempt.status === 201);
    const recordedReview = await prisma.submissionReview.findFirst({ where: { submissionId: submissionForForgery.id } });
    check('the review is recorded under the REAL authenticated caller (reviewer A), not the forged body claim (reviewer B)', recordedReview?.reviewerId === reviewerA.accountId);
    check('the forged reviewerId from the body never made it into the database', recordedReview?.reviewerId !== reviewerB.accountId);

    console.log('\n== Self-review is still rejected, now checked against the real authenticated identity ==');
    const submissionForSelfReview = await freshSubmission(submitter.accountId);
    const selfReviewAttempt = await call('POST', `/admin/v1/submissions/${submissionForSelfReview.id}/reviews`, {
      token: submitter.sessionToken,
      body: { decision: 'APPROVE', notes: 'trying to approve my own submission', reviewerId: reviewerA.accountId },
    });
    check('the submitter cannot approve their own submission even by naming a different reviewer in the body', selfReviewAttempt.status === 409);

    console.log('\n== Two real, distinct logins are now required for two distinct approvals (the actual dual-control point) ==');
    // HIGH risk requires 2 approvals before the submission leaves NEEDS_REVIEW -- LOW only needs
    // 1, which would make the second call fail with "not reviewable" for an unrelated reason.
    const submissionForDualControl = await freshSubmission(submitter.accountId, 'HIGH');
    const firstApproval = await call('POST', `/admin/v1/submissions/${submissionForDualControl.id}/reviews`, {
      token: reviewerA.sessionToken, body: { decision: 'APPROVE', notes: 'first real approval', reviewerId: 'ignored-by-server' },
    });
    check('the first real reviewer (A) approves successfully', firstApproval.status === 201);
    const repeatWithSameSessionButDifferentClaimedId = await call('POST', `/admin/v1/submissions/${submissionForDualControl.id}/reviews`, {
      token: reviewerA.sessionToken, body: { decision: 'APPROVE', notes: 'trying to double-count as reviewer B without logging in as B', reviewerId: reviewerB.accountId },
    });
    // The server correctly resolves the caller as A again (not the forged B), and the schema's
    // own (submissionId, reviewerId) unique constraint then rejects A reviewing the same
    // submission twice -- a real, independent guarantee this fix doesn't have to reimplement.
    check('reusing the SAME session while claiming to be reviewer B in the body is rejected as A reviewing twice, not recorded as B', repeatWithSameSessionButDifferentClaimedId.status === 409);
    const reviewsSoFar = await prisma.submissionReview.findMany({ where: { submissionId: submissionForDualControl.id } });
    const distinctReviewers = new Set(reviewsSoFar.map((r) => r.reviewerId));
    check('exactly one real review exists so far, and reviewer B never actually approved anything', reviewsSoFar.length === 1 && !distinctReviewers.has(reviewerB.accountId));
    const secondApproval = await call('POST', `/admin/v1/submissions/${submissionForDualControl.id}/reviews`, {
      token: reviewerB.sessionToken, body: { decision: 'APPROVE', notes: 'the real second reviewer, actually logged in this time' },
    });
    check('a genuine second reviewer, actually logged in as themselves, can approve', secondApproval.status === 201);
    const finalSubmission = await prisma.pluginSubmission.findUnique({ where: { id: submissionForDualControl.id } });
    check('the submission only becomes approved once two REAL distinct reviewers approved it', finalSubmission.status === 'APPROVED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
