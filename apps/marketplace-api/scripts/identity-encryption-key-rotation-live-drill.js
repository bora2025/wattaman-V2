/**
 * Live drill for the IDENTITY_ENCRYPTION_KEYS_JSON self-healing rotation described in
 * docs/operations/secret-rotation-runbooks.md. Proves, against a real disposable PostgreSQL
 * 16 using the real IdentityService, that: (1) adding a new active key while keeping the old
 * one lets already-encrypted secrets keep decrypting, (2) a successful TOTP login
 * transparently re-encrypts the secret under the new active key with no extra step, (3) it's
 * then safe to drop the old key entirely, and (4) dropping a key that's still in use fails
 * loudly rather than silently.
 *
 * Run (from apps/marketplace-api):
 *   MARKETPLACE_DATABASE_URL=postgresql://user:pass@host:port/db \
 *   node scripts/identity-encryption-key-rotation-live-drill.js
 */
'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { IdentityService } = require('../dist/identity.service');
const { totpCode } = require('../dist/identity-crypto');

let passed = 0;
let failed = 0;
function check(description, condition) {
  if (condition) { passed += 1; console.log(`PASS ${description}`); }
  else { failed += 1; console.log(`FAIL ${description}`); }
}
async function rejects(description, run, expected) {
  try {
    await run();
    failed += 1;
    console.log(`FAIL ${description} (expected a rejection, got success)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (expected.test(message)) { passed += 1; console.log(`PASS ${description}`); }
    else { failed += 1; console.log(`FAIL ${description} (rejected with unexpected message: ${message})`); }
  }
}

function newKey() {
  return crypto.randomBytes(32).toString('base64');
}

function baseConfig() {
  return {
    nodeEnv: 'development',
    publicBaseUrl: 'https://marketplace.example',
  };
}

async function main() {
  const databaseUrl = process.env.MARKETPLACE_DATABASE_URL;
  if (!databaseUrl) throw new Error('MARKETPLACE_DATABASE_URL is required');

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();

  try {
    const keyV1 = { keyId: 'identity-v1', key: newKey() };
    const keyV2 = { keyId: 'identity-v2', key: newKey() };

    console.log('== Step 1: enroll MFA with only identity-v1 active ==');
    const identityV1Only = new IdentityService(prisma, {
      ...baseConfig(),
      identityEncryptionKeys: [{ keyId: keyV1.keyId, key: Buffer.from(keyV1.key, 'base64') }],
    });
    const email = `rotation-drill-${Date.now()}@drill.test`;
    const password = 'Rotation-Drill-Password-9';
    const register = await identityV1Only.register({ email, password, displayName: 'Rotation Drill' });
    const accountId = register.account.id;
    const enroll = await identityV1Only.enrollMfa(accountId);
    const confirm = await identityV1Only.confirmMfaEnrollment(accountId, { code: totpCode(enroll.secret, Math.floor(Date.now() / 1000 / 30)) });
    check('MFA enrollment succeeds under identity-v1', confirm.enabled === true);

    const rowAfterEnroll = await prisma.marketplaceAccount.findUnique({ where: { id: accountId }, select: { mfaSecret: true } });
    check('the stored mfaSecret is encrypted under identity-v1', rowAfterEnroll.mfaSecret.startsWith('enc:v1:identity-v1:'));

    console.log('\n== Step 2: "redeploy" with identity-v2 active, identity-v1 still present ==');
    const bothKeysV2Active = new IdentityService(prisma, {
      ...baseConfig(),
      identityEncryptionKeys: [
        { keyId: keyV2.keyId, key: Buffer.from(keyV2.key, 'base64') },
        { keyId: keyV1.keyId, key: Buffer.from(keyV1.key, 'base64') },
      ],
    });
    const loginDuringOverlap = await bothKeysV2Active.login({ email, password, code: totpCode(enroll.secret, Math.floor(Date.now() / 1000 / 30)) });
    check('login succeeds while the secret is still encrypted under the old key (old key still trusted)', loginDuringOverlap.status === 'authenticated');

    const rowAfterOverlapLogin = await prisma.marketplaceAccount.findUnique({ where: { id: accountId }, select: { mfaSecret: true } });
    check('a single successful login transparently re-encrypted the secret under identity-v2, no extra step', rowAfterOverlapLogin.mfaSecret.startsWith('enc:v1:identity-v2:'));

    console.log('\n== Step 3: "redeploy" again with identity-v1 fully removed ==');
    const onlyV2 = new IdentityService(prisma, {
      ...baseConfig(),
      identityEncryptionKeys: [{ keyId: keyV2.keyId, key: Buffer.from(keyV2.key, 'base64') }],
    });
    const loginAfterDroppingOldKey = await onlyV2.login({ email, password, code: totpCode(enroll.secret, Math.floor(Date.now() / 1000 / 30)) });
    check('login still succeeds after the old key is fully removed, since re-encryption already happened', loginAfterDroppingOldKey.status === 'authenticated');

    console.log('\n== Step 4: negative control -- a botched rotation that drops the wrong key fails loudly ==');
    const onlyOldKeyAgain = new IdentityService(prisma, {
      ...baseConfig(),
      identityEncryptionKeys: [{ keyId: keyV1.keyId, key: Buffer.from(keyV1.key, 'base64') }],
    });
    await rejects('logging in with only the now-wrong old key configured fails loudly, not silently',
      () => onlyOldKeyAgain.login({ email, password, code: totpCode(enroll.secret, Math.floor(Date.now() / 1000 / 30)) }),
      /Encrypted secret key identity-v2 is not configured/);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
