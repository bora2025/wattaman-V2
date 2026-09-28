/**
 * Live drill for the ENTITLEMENT_SIGNING_PRIVATE_KEY rotation described in
 * docs/operations/secret-rotation-runbooks.md ("Entitlement signing key" section), which states
 * plainly that this procedure "has not been live-drilled the way the repository key's has."
 * This closes that stated gap.
 *
 * Uses the real, production functions on both sides -- issueEntitlement() from
 * apps/marketplace-api/src/entitlement.ts (the marketplace's issuing side, which really does
 * only sign with one active key at a time, confirming the runbook's stated asymmetry) and
 * verifyFetchedEntitlement() from backend/src/marketplace/entitlement-verification.ts (the
 * school's verification side, which really does trust a map of multiple key IDs at once). Both
 * are pure functions with no database or NestJS dependency, so this drill needs neither --
 * it proves the cryptographic rotation mechanics directly, exactly as the runbook describes them.
 *
 * Run (from apps/marketplace-api, after `npm run build` in both this app and backend/):
 *   node scripts/entitlement-signing-key-rotation-live-drill.js
 */
'use strict';

const crypto = require('crypto');
const path = require('path');

const { issueEntitlement } = require('../dist/entitlement');
const backendRoot = path.resolve(__dirname, '../../../backend');
const { verifyFetchedEntitlement } = require(path.join(backendRoot, 'dist/marketplace/entitlement-verification'));

let passed = 0;
let failed = 0;
function check(description, condition) {
  if (condition) { passed += 1; console.log(`PASS ${description}`); }
  else { failed += 1; console.log(`FAIL ${description}`); }
}
function rejects(description, run, expectedMessage) {
  try {
    run();
    failed += 1;
    console.log(`FAIL ${description} (expected a rejection, got success)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === expectedMessage) { passed += 1; console.log(`PASS ${description}`); }
    else { failed += 1; console.log(`FAIL ${description} (rejected with unexpected message: ${message})`); }
  }
}

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function issue(privateKey, keyId, now, overrides = {}) {
  const notBefore = now;
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return issueEntitlement({
    generation: 1, status: 'ACTIVE',
    installationId: 'installation-drill-1',
    customerId: 'customer-drill-1',
    productId: 'product-drill-1',
    licensedMajorRange: '^1.0.0',
    notBefore: notBefore.toISOString(),
    expiresAt: expiresAt.toISOString(),
    updatesThrough: expiresAt.toISOString(),
    offlineRecheckAfter: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    features: ['core'],
    issuer: 'https://marketplace.example',
    ...overrides,
  }, privateKey, keyId, now);
}

function verify(token, publicKeys, asOf) {
  return verifyFetchedEntitlement(token, publicKeys, {
    installationId: 'installation-drill-1',
    productId: 'product-drill-1',
    now: asOf,
  });
}

function main() {
  const now = new Date();
  const asOf = new Date(now.getTime() + 5000);
  const keyV1 = { keyId: 'entitlement-v1', ...generateKeypair() };
  const keyV2 = { keyId: 'entitlement-v2', ...generateKeypair() };

  console.log('== Step 0: baseline -- marketplace signs with entitlement-v1 only, school trusts only entitlement-v1 ==');
  const tokenOld = issue(keyV1.privateKey, keyV1.keyId, now);
  check('token signed by entitlement-v1 verifies against a trust map containing only entitlement-v1',
    verify(tokenOld, new Map([[keyV1.keyId, keyV1.publicKey]]), asOf).keyId === keyV1.keyId);

  console.log('\n== Step 1 (runbook step 2): add entitlement-v2 to the school\'s trusted keys BEFORE touching the marketplace ==');
  const trustDuringOverlap = new Map([[keyV1.keyId, keyV1.publicKey], [keyV2.keyId, keyV2.publicKey]]);
  check('the pre-rotation token (signed entitlement-v1) still verifies once entitlement-v2 is merely added as trusted',
    verify(tokenOld, trustDuringOverlap, asOf).keyId === keyV1.keyId);

  console.log('\n== Step 2 (runbook step 4): marketplace swaps its single active signing key to entitlement-v2 ==');
  const tokenNew = issue(keyV2.privateKey, keyV2.keyId, now);
  check('a freshly issued token now carries keyId entitlement-v2', tokenNew.payload.keyId === keyV2.keyId);
  check('the new token verifies during the overlap window (trust map still has both keys)',
    verify(tokenNew, trustDuringOverlap, asOf).keyId === keyV2.keyId);
  check('the OLD token (issued before rotation, not yet expired) still verifies during the same overlap window -- this is the actual point of overlap: both old and new tokens are valid at once',
    verify(tokenOld, trustDuringOverlap, asOf).keyId === keyV1.keyId);

  console.log('\n== Step 3 (runbook step 6): overlap window closes -- entitlement-v1 removed from the school\'s trust map ==');
  const trustAfterRotation = new Map([[keyV2.keyId, keyV2.publicKey]]);
  check('the new token (entitlement-v2) still verifies after the old key is dropped',
    verify(tokenNew, trustAfterRotation, asOf).keyId === keyV2.keyId);
  rejects('the OLD token (entitlement-v1) now fails closed once its key is no longer trusted -- proving why the runbook says to wait out the offline window before this step, not do it early',
    () => verify(tokenOld, trustAfterRotation, asOf),
    'Entitlement signing key is not trusted');

  console.log('\n== Negative control: a token cannot claim a different keyId than the one that actually signed it ==');
  const tokenTampered = issue(keyV1.privateKey, keyV1.keyId, now);
  tokenTampered.payload.keyId = keyV2.keyId;
  rejects('a token signed by entitlement-v1 but relabeled as entitlement-v2 is rejected as a key-id mismatch, not silently trusted',
    () => verify(tokenTampered, trustDuringOverlap, asOf),
    'Entitlement key id mismatch');

  console.log('\n== Negative control: an untrusted key id is rejected even if the signature itself is well-formed ==');
  const keyV3Untrusted = { keyId: 'entitlement-v3', ...generateKeypair() };
  const tokenFromUnknownKey = issue(keyV3Untrusted.privateKey, keyV3Untrusted.keyId, now);
  rejects('a token signed by a key the school has never been told to trust is rejected',
    () => verify(tokenFromUnknownKey, trustDuringOverlap, asOf),
    'Entitlement signing key is not trusted');

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}

main();
