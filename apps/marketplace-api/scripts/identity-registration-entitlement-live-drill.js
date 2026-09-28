/**
 * E-001/E-002/E-005 live drill: customer identity, installation registration, and the
 * entitlement cache, run against REAL PostgreSQL databases (one per service) with the
 * marketplace's real Express app listening on a real HTTP port and the school's real
 * NestJS service classes making real signed HTTP calls to it. Every prior test of these
 * three work packages ran against mocked Prisma transactions and in-process function
 * calls only; this is the first drill that exercises live persistence, a live network
 * hop, and the two independently-written Ed25519 implementations (installation
 * registration/rotation signatures, entitlement token signatures) actually talking to
 * each other over the wire.
 *
 * Prerequisites (not started by this script):
 *   - `npm run build` in both apps/marketplace-api and backend (this script requires
 *     their compiled dist/ output directly, matching how the compiled artifacts are
 *     actually deployed).
 *   - `npx prisma generate` in both projects against the current schema.
 *   - Two empty, migrated PostgreSQL 16 databases reachable from this process.
 *
 * Run (from apps/marketplace-api):
 *   MARKETPLACE_DATABASE_URL=postgresql://user:pass@host:port/marketplace_db \
 *   SCHOOL_DATABASE_URL=postgresql://user:pass@host:port/school_db \
 *   node scripts/identity-registration-entitlement-live-drill.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const yazl = require('yazl');

const backendRoot = path.resolve(__dirname, '../../../backend');
require(path.join(backendRoot, 'node_modules/reflect-metadata'));

const { PrismaClient: MarketplacePrismaClient } = require('@prisma/client');
const { createApp } = require('../dist/app');
const { readConfig } = require('../dist/config');
const { totpCode } = require('../dist/identity-crypto');
const { canonicalJson } = require('../dist/signing');
const { CommerceService } = require('../dist/commerce.service');
const { StarterBundleService } = require('../dist/starter-bundle.service');

function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
async function zip(entries) {
  const archive = new yazl.ZipFile();
  for (const [name, value] of Object.entries(entries)) archive.addBuffer(value, name);
  archive.end();
  const chunks = [];
  for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function signedPluginPackage(pluginId, name, publisherKey, publisherKeyId) {
  const manifest = {
    schemaVersion: 1, id: pluginId, name, description: 'Phase E signed installation fixture.',
    version: '1.0.0', requiresCore: '^1.0.0', publisher: 'drill-publisher', license: 'commercial',
    capabilities: [], permissions: [], dependencies: {}, migrations: [], navigation: [], supportedLanguages: [],
  };
  const pluginJson = Buffer.from(JSON.stringify(manifest));
  const checksums = Buffer.from(JSON.stringify({ algorithm: 'sha256', files: { 'plugin.json': digest(pluginJson) } }));
  const signature = Buffer.from(JSON.stringify({
    algorithm: 'ed25519', publisher: 'drill-publisher', keyId: publisherKeyId,
    signature: crypto.sign(null, checksums, publisherKey.privateKey).toString('base64'),
  }));
  return { manifest, buffer: await zip({ 'plugin.json': pluginJson, 'checksums.json': checksums, 'signature.json': signature }) };
}

const { PrismaClient: SchoolPrismaClient } = require(path.join(backendRoot, 'node_modules/@prisma/client'));
const { InstallationKeyService } = require(path.join(backendRoot, 'dist/marketplace/installation-key.service'));
const { InstallationRegistrationService: SchoolInstallationRegistrationService } = require(path.join(backendRoot, 'dist/marketplace/installation-registration.service'));
const { EntitlementCacheService } = require(path.join(backendRoot, 'dist/marketplace/entitlement-cache.service'));
const { MarketplaceCommerceService } = require(path.join(backendRoot, 'dist/marketplace/marketplace-commerce.service'));
const { pluginInstallConsentDigest } = require(path.join(backendRoot, 'dist/marketplace/plugin-install-consent'));
const { PluginEntitlementPolicyService } = require(path.join(backendRoot, 'dist/plugins/plugin-entitlement-policy.service'));
const { PluginPackageVerifier } = require(path.join(backendRoot, 'dist/plugins/plugin-package'));
const { PluginMigrationsService } = require(path.join(backendRoot, 'dist/plugins/plugin-migrations.service'));
const { PluginsService } = require(path.join(backendRoot, 'dist/plugins/plugins.service'));
const { UpdatesService } = require(path.join(backendRoot, 'dist/updates/updates.service'));
const { AuditService } = require(path.join(backendRoot, 'dist/audit/audit.service'));

const PORT = Number(process.env.DRILL_MARKETPLACE_PORT || 34910);
const BASE = `http://127.0.0.1:${PORT}`;

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

function edKeyPair() {
  const pair = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function signWith(privateKeyPem, payload) {
  return crypto.sign(null, Buffer.from(canonicalJson(payload)), privateKeyPem).toString('base64');
}

async function call(method, urlPath, { body, token, query } = {}) {
  const url = new URL(urlPath, BASE);
  if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch { /* no body */ }
  return { status: response.status, body: json };
}

async function main() {
  const marketplaceDatabaseUrl = process.env.MARKETPLACE_DATABASE_URL;
  const schoolDatabaseUrl = process.env.SCHOOL_DATABASE_URL;
  if (!marketplaceDatabaseUrl || !schoolDatabaseUrl) {
    throw new Error('MARKETPLACE_DATABASE_URL and SCHOOL_DATABASE_URL are both required');
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-e-drill-'));
  const metadataKey = edKeyPair();
  const entitlementKey = edKeyPair();
  const identityEncryptionKey = crypto.randomBytes(32).toString('base64');

  const marketplaceEnv = {
    NODE_ENV: 'development',
    PORT: String(PORT),
    DATABASE_URL: marketplaceDatabaseUrl,
    PUBLIC_BASE_URL: BASE,
    MARKETPLACE_ADMIN_TOKEN: crypto.randomBytes(24).toString('hex'),
    METADATA_SIGNING_PRIVATE_KEY: metadataKey.privateKey,
    METADATA_SIGNING_KEY_ID: 'metadata-drill-2026',
    ENTITLEMENT_SIGNING_PRIVATE_KEY: entitlementKey.privateKey,
    ENTITLEMENT_SIGNING_KEY_ID: 'entitlement-drill-2026',
    PAYMENT_WEBHOOK_SECRET: crypto.randomBytes(24).toString('hex'),
    ARTIFACT_STORAGE_PATH: path.join(workDir, 'artifacts'),
    IDENTITY_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'identity-drill-2026': identityEncryptionKey }),
    IDENTITY_ENCRYPTION_ACTIVE_KEY_ID: 'identity-drill-2026',
  };
  const marketplaceConfig = readConfig(marketplaceEnv);
  const marketplacePrisma = new MarketplacePrismaClient({ datasourceUrl: marketplaceDatabaseUrl });
  await marketplacePrisma.$connect();

  let app = createApp(marketplacePrisma, marketplaceConfig);
  let server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolve); });
  console.log(`marketplace-api listening on ${BASE}`);

  // Backend-side config readers (marketplace-identity-config.ts, entitlement-config.ts)
  // read process.env directly with no override parameter, so these must be real globals.
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = schoolDatabaseUrl;
  process.env.APP_VERSION = '1.0.0';
  process.env.MARKETPLACE_URL = BASE;
  process.env.INSTALLATION_KEY_DIR = path.join(workDir, 'installation-identity');
  process.env.ENTITLEMENT_PUBLIC_KEY = entitlementKey.publicKey;
  process.env.ENTITLEMENT_KEY_ID = 'entitlement-drill-2026';
  process.env.UPDATE_REPOSITORY_PUBLIC_KEY = metadataKey.publicKey;
  process.env.UPDATE_REPOSITORY_KEY_ID = 'metadata-drill-2026';
  process.env.UPDATE_CHANNEL = 'stable';
  process.env.PLUGIN_DIR = path.join(workDir, 'plugins');

  const schoolPrisma = new SchoolPrismaClient({ datasourceUrl: schoolDatabaseUrl });
  await schoolPrisma.$connect();
  const installation = await schoolPrisma.installation.create({
    data: { schoolName: 'Live Drill School', schoolSlug: 'live-drill-school', coreVersion: '1.0.0' },
  });
  const schoolInstallationId = installation.installationId;

  const keys = new InstallationKeyService();
  const audit = new AuditService(schoolPrisma);
  const registration = new SchoolInstallationRegistrationService(schoolPrisma, keys);
  const entitlementCache = new EntitlementCacheService(schoolPrisma, keys, audit);

  try {
    console.log('\n== E-001: registration, verification, login ==');
    const ownerEmail = 'owner@drill.test';
    const ownerPassword = 'Correct-Horse-Battery-9';
    const registerResult = await call('POST', '/v1/accounts', { body: { email: ownerEmail, password: ownerPassword, displayName: 'Drill Owner' } });
    check('register returns 201', registerResult.status === 201);
    check('register echoes a verification token outside production', typeof registerResult.body?.emailVerificationToken === 'string');
    const accountId = registerResult.body.account.id;

    const duplicate = await call('POST', '/v1/accounts', { body: { email: ownerEmail, password: ownerPassword, displayName: 'Drill Owner' } });
    check('duplicate registration is rejected', duplicate.status === 409);

    const badConfirm = await call('POST', '/v1/accounts/email-verifications/confirm', { body: { token: 'not-a-real-token-not-a-real-token' } });
    check('confirming a bogus token is rejected', badConfirm.status === 400);

    const confirm = await call('POST', '/v1/accounts/email-verifications/confirm', { body: { token: registerResult.body.emailVerificationToken } });
    check('confirming the real token succeeds', confirm.status === 200 && confirm.body.verified === true);

    const reuseConfirm = await call('POST', '/v1/accounts/email-verifications/confirm', { body: { token: registerResult.body.emailVerificationToken } });
    check('reusing an already-consumed verification token is rejected', reuseConfirm.status === 400);

    const login1 = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: ownerPassword } });
    check('login with correct credentials (no MFA yet) authenticates', login1.status === 200 && login1.body.status === 'authenticated');
    let session = login1.body.sessionToken;

    const wrongPassword = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: 'wrong-password-entirely' } });
    check('login with wrong password is rejected', wrongPassword.status === 401);

    const enroll = await call('POST', '/v1/mfa/enrollments', { token: session });
    check('MFA enrollment returns a secret and otpauth URI', enroll.status === 201 && typeof enroll.body.secret === 'string' && enroll.body.otpauthUri.startsWith('otpauth://'));
    const mfaSecret = enroll.body.secret;

    const badMfaConfirm = await call('POST', '/v1/mfa/enrollments/confirm', { token: session, body: { code: '000000' } });
    check('confirming MFA enrollment with a wrong code is rejected', badMfaConfirm.status === 400);

    const goodCode = totpCode(mfaSecret, Math.floor(Date.now() / 1000 / 30));
    const mfaConfirm = await call('POST', '/v1/mfa/enrollments/confirm', { token: session, body: { code: goodCode } });
    check('confirming MFA enrollment with the real TOTP code succeeds', mfaConfirm.status === 200 && mfaConfirm.body.enabled === true);
    const recoveryCodes = mfaConfirm.body.recoveryCodes;
    check('MFA enrollment issues 8 recovery codes', Array.isArray(recoveryCodes) && recoveryCodes.length === 8);

    const loginNeedsMfa = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: ownerPassword } });
    check('login without a code now reports mfa_required', loginNeedsMfa.status === 200 && loginNeedsMfa.body.status === 'mfa_required');

    const loginWrongMfa = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: ownerPassword, code: '111111' } });
    check('login with a wrong MFA code is rejected', loginWrongMfa.status === 401);

    const freshCode = totpCode(mfaSecret, Math.floor(Date.now() / 1000 / 30));
    const loginWithMfa = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: ownerPassword, code: freshCode } });
    check('login with the real TOTP code authenticates', loginWithMfa.status === 200 && loginWithMfa.body.status === 'authenticated');
    session = loginWithMfa.body.sessionToken;

    const recoveryCode = recoveryCodes[0];
    const loginWithRecovery = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: ownerPassword, code: recoveryCode } });
    check('login with an unused recovery code authenticates', loginWithRecovery.status === 200 && loginWithRecovery.body.status === 'authenticated');
    const loginReuseRecovery = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: ownerPassword, code: recoveryCode } });
    check('reusing an already-consumed recovery code is rejected', loginReuseRecovery.status === 401);

    const refresh1 = await call('POST', '/v1/sessions/refresh', { body: { sessionToken: session } });
    check('session refresh issues a new token', refresh1.status === 200 && typeof refresh1.body.sessionToken === 'string' && refresh1.body.sessionToken !== session);
    const rotatedAwaySession = session;
    const currentSession = refresh1.body.sessionToken;

    const replay = await call('POST', '/v1/sessions/refresh', { body: { sessionToken: rotatedAwaySession } });
    check('replaying an already-rotated session token is rejected', replay.status === 401);
    const afterReuseDetection = await call('GET', '/v1/customer/orders', { token: currentSession });
    check('reuse detection on a rotated token revokes every other session on the account too', afterReuseDetection.status === 401);

    const freshCode2 = totpCode(mfaSecret, Math.floor(Date.now() / 1000 / 30));
    const relogin = await call('POST', '/v1/sessions', { body: { email: ownerEmail, password: ownerPassword, code: freshCode2 } });
    const revocableSession = relogin.body.sessionToken;
    const revoke = await call('POST', '/v1/sessions/revoke', { token: revocableSession, body: { sessionToken: revocableSession } });
    check('explicit session revocation succeeds', revoke.status === 200 && revoke.body.revoked === true);
    const afterRevoke = await call('GET', '/v1/customer/orders', { token: revocableSession });
    check('a revoked session can no longer be used', afterRevoke.status === 401);

    console.log('\n== E-001: exponential lockout and password reset (separate account) ==');
    const lockoutEmail = 'lockout@drill.test';
    const lockoutPassword = 'Another-Correct-9';
    const lockoutRegister = await call('POST', '/v1/accounts', { body: { email: lockoutEmail, password: lockoutPassword, displayName: 'Lockout Drill' } });
    let sawLock = false;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const attemptResult = await call('POST', '/v1/sessions', { body: { email: lockoutEmail, password: 'not-the-real-password' } });
      if (attempt < 5) check(`lockout attempt ${attempt} of 5 is a plain auth failure`, attemptResult.status === 401);
      else { sawLock = attemptResult.status === 401; }
    }
    check('the 5th consecutive failure is recorded (about to lock)', sawLock);
    const lockedEvenWithCorrectPassword = await call('POST', '/v1/sessions', { body: { email: lockoutEmail, password: lockoutPassword } });
    check('the account is locked even against the correct password', lockedEvenWithCorrectPassword.status === 423);

    const resetRequest = await call('POST', '/v1/password-resets', { body: { email: lockoutEmail } });
    check('password reset request returns a token outside production', resetRequest.status === 202 && typeof resetRequest.body.passwordResetToken === 'string');
    const newPassword = 'Brand-New-Password-9';
    const resetConfirm = await call('POST', '/v1/password-resets/confirm', { body: { token: resetRequest.body.passwordResetToken, newPassword } });
    check('password reset confirmation succeeds', resetConfirm.status === 200 && resetConfirm.body.reset === true);
    const loginAfterReset = await call('POST', '/v1/sessions', { body: { email: lockoutEmail, password: newPassword } });
    check('a password reset also lifts the lockout', loginAfterReset.status === 200 && loginAfterReset.body.status === 'authenticated');

    const auditActions = new Set((await marketplacePrisma.marketplaceAuditEvent.findMany({ where: { accountId: { in: [accountId, lockoutRegister.body.account.id] } }, select: { action: true } })).map((row) => row.action));
    for (const expectedAction of ['account_registered', 'email_verified', 'mfa_enrolled', 'mfa_enabled', 'login_succeeded', 'login_failed', 'login_locked', 'session_refreshed', 'session_reuse_detected', 'session_revoked', 'password_reset_requested', 'password_reset_completed']) {
      check(`an audit row was written for "${expectedAction}"`, auditActions.has(expectedAction));
    }

    console.log('\n== E-002: installation registration challenge, key rotation, continuity of control ==');
    const statusBefore = await registration.status();
    check('school-side status reports marketplace configured and a local key ready before registering', statusBefore.marketplaceConfigured === true && statusBefore.hasLocalKey === true);
    const originalFingerprint = statusBefore.keyFingerprint;

    const registerCall = await registration.register(accountId, 'Drill School Installation');
    check('installation registration succeeds end to end over real HTTP', registerCall.installationId === schoolInstallationId && registerCall.keyFingerprint === originalFingerprint);
    const registrationRow = await marketplacePrisma.installationRegistration.findUnique({ where: { installationId: schoolInstallationId }, include: { keys: true } });
    check('the marketplace persisted exactly one active registration key', !!registrationRow && registrationRow.keys.filter((key) => !key.revokedAt).length === 1);

    await rejects('registering an already-registered installation again is rejected',
      () => registration.register(accountId, 'Second attempt'),
      /already registered/);
    const hijackChallenge = await call('POST', '/v1/installations/challenges', { body: { installationId: schoolInstallationId, purpose: 'register' } });
    check('requesting a fresh register challenge for an already-registered installation is rejected directly', hijackChallenge.status === 409);

    const oldPrivateKeyPem = (await keys.ensureKeyPair()).privateKeyPem;
    const rotateCall = await registration.rotateKey();
    check('key rotation succeeds and returns a new fingerprint', rotateCall.keyFingerprint !== originalFingerprint);
    const newFingerprint = (await keys.ensureKeyPair()).fingerprint;
    check('the school-local cached key reflects the rotated key', newFingerprint === rotateCall.keyFingerprint);
    const registrationAfterRotate = await marketplacePrisma.installationRegistration.findUnique({ where: { installationId: schoolInstallationId }, include: { keys: true } });
    const revokedOld = registrationAfterRotate.keys.find((key) => key.keyFingerprint !== newFingerprint);
    const activeNew = registrationAfterRotate.keys.find((key) => key.keyFingerprint === newFingerprint);
    check('the pre-rotation key is now revoked server-side', !!revokedOld?.revokedAt);
    check('the post-rotation key is active server-side', !!activeNew && !activeNew.revokedAt);

    const replayChallenge = await call('POST', '/v1/installations/challenges', { body: { installationId: schoolInstallationId, purpose: 'rotate' } });
    const forgedNewKey = edKeyPair();
    const forgedSignature = signWith(oldPrivateKeyPem, {
      installationId: schoolInstallationId, challengeId: replayChallenge.body.challengeId, nonce: replayChallenge.body.nonce,
      purpose: 'rotate', newKeyFingerprint: crypto.createHash('sha256').update(crypto.createPublicKey(forgedNewKey.publicKey).export({ type: 'spki', format: 'der' })).digest('hex'),
    });
    const replayRotate = await call('POST', `/v1/installations/${schoolInstallationId}/keys/rotate`, {
      body: { challengeId: replayChallenge.body.challengeId, signature: forgedSignature, newPublicKeyPem: forgedNewKey.publicKey },
    });
    check('replaying rotation with the pre-rotation (now revoked) key is rejected', replayRotate.status === 400);

    const restartedKeyService = new InstallationKeyService();
    const reloaded = await restartedKeyService.ensureKeyPair();
    check('the rotated private key survives being reloaded from disk by a fresh process', reloaded.fingerprint === newFingerprint);

    console.log('\n== E-005: entitlement cache — fetch, fail-open on outage, fail-closed on trust failure ==');
    // Every refreshOne() call below signs its outgoing request with the real wall clock, exactly
    // as production does, so the marketplace's +/-5 minute freshness check always sees a valid
    // timestamp. To exercise the backoff schedule (1/5/15/60 minutes) without either forging that
    // signed timestamp or actually sleeping for up to an hour, ageCacheRow() backdates only the
    // cache's own bookkeeping column that the backoff decision reads.
    const pluginId = 'drill-publisher.attendance-drill';
    async function ageCacheRow(minutesAgo) {
      await schoolPrisma.pluginEntitlementCache.update({ where: { pluginId }, data: { lastRefreshAttemptAt: new Date(Date.now() - minutesAgo * 60_000) } });
    }

    const beforePurchase = await entitlementCache.refreshOne(pluginId);
    check('a plugin with no purchase yet resolves to NONE, not an error', beforePurchase.status === 'NONE');
    await schoolPrisma.pluginEntitlementCache.delete({ where: { pluginId } });

    const publisherSigningKey = crypto.generateKeyPairSync('ed25519');
    const publisherKeyId = 'drill-publisher-key';
    const publisher = await marketplacePrisma.publisher.create({ data: {
      slug: 'drill-publisher', displayName: 'Drill Publisher', status: 'VERIFIED',
      keys: { create: {
        keyId: publisherKeyId,
        publicKeyPem: publisherSigningKey.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        approvedAt: new Date(), approvedBy: 'phase-e-certification',
      } },
    } });
    const plugin = await marketplacePrisma.marketplacePlugin.create({ data: { id: pluginId, publisherId: publisher.id, name: 'Attendance Drill', description: 'Live drill fixture', license: 'proprietary', isPaid: true, status: 'APPROVED' } });
    const price = await marketplacePrisma.productPrice.create({ data: { pluginId: plugin.id, currency: 'USD', amountMinor: 2500, licensedMajor: 1, validFrom: new Date(Date.now() - 86_400_000), updatesDays: 180, licenseDays: 365 } });
    const freePluginId = 'drill-publisher.academic-foundation-drill';
    await marketplacePrisma.marketplacePlugin.create({ data: {
      id: freePluginId, publisherId: publisher.id, name: 'Academic Foundation Drill',
      description: 'Free member of the live starter-bundle fixture', license: 'proprietary', isPaid: false, status: 'APPROVED',
    } });
    const packages = new Map();
    for (const [releasePluginId, releaseName] of [[freePluginId, 'Academic Foundation Drill'], [pluginId, 'Attendance Drill']]) {
      const signedPackage = await signedPluginPackage(releasePluginId, releaseName, publisherSigningKey, publisherKeyId);
      const packageSha256 = digest(signedPackage.buffer);
      const storageKey = `sha256/${packageSha256.slice(0, 2)}/${packageSha256}.wtp`;
      const storageFile = path.join(workDir, 'artifacts', storageKey);
      fs.mkdirSync(path.dirname(storageFile), { recursive: true });
      fs.writeFileSync(storageFile, signedPackage.buffer);
      packages.set(releasePluginId, { ...signedPackage, packageSha256 });
      await marketplacePrisma.pluginVersion.create({ data: {
        pluginId: releasePluginId, version: '1.0.0', requiresCore: '^1.0.0', channel: 'STABLE', reviewStatus: 'APPROVED',
        manifestJson: signedPackage.manifest, publishedAt: new Date(),
        artifact: { create: {
          sha256: packageSha256, sizeBytes: signedPackage.buffer.length, storageKey,
          publisherKeyId,
        } },
      } });
    }
    const bundleOperator = await marketplacePrisma.platformOperator.create({ data: {
      email: 'bundle-operator@drill.test', displayName: 'Bundle Drill Operator', passwordHash: 'live-drill-only',
    } });
    const bundleActor = {
      operatorId: bundleOperator.id, reason: 'Phase E real-stack starter-bundle certification',
      context: { correlationId: 'starter-bundle-live-drill', ip: '127.0.0.1', userAgent: 'phase-e-certification' },
    };
    const starterBundles = new StarterBundleService(marketplacePrisma);
    const bundle = await starterBundles.create({
      slug: 'phase-e-school-starter', name: 'Phase E School Starter', description: 'Mixed free and paid live certification.',
      items: [
        { pluginId: freePluginId, versionRange: '^1.0.0', required: true },
        { pluginId, versionRange: '^1.0.0', required: true },
      ],
    }, bundleActor);
    await starterBundles.publish(bundle.id, bundleActor);
    const bundleCatalog = await call('GET', '/v1/starter-bundles', { query: { coreVersion: '1.0.0', currency: 'USD' } });
    const discoveredBundle = Array.isArray(bundleCatalog.body)
      ? bundleCatalog.body.find((candidate) => candidate.id === bundle.id)
      : null;
    check('the linked school discovers the published mixed starter bundle over real HTTP',
      bundleCatalog.status === 200 && discoveredBundle?.plugins?.length === 2);
    check('bundle discovery keeps free and paid acquisition independent',
      discoveredBundle?.plugins?.[0]?.paid === false && !discoveredBundle.plugins[0].price
      && discoveredBundle?.plugins?.[1]?.paid === true && discoveredBundle.plugins[1].price?.id === price.id);
    const commerce = new CommerceService(marketplacePrisma, marketplaceConfig);
    const paidBundlePriceId = discoveredBundle?.plugins?.find((candidate) => candidate.pluginId === pluginId)?.price?.id;
    check('the paid order is sourced from the server-resolved bundle plan', paidBundlePriceId === price.id);
    const order = await commerce.createOrder({ accountId, installationId: registrationRow.id, currency: 'USD', priceIds: [paidBundlePriceId], idempotencyKey: 'drill-order-0001' });
    const settlement = await commerce.settleManualPayment({ orderId: order.id, providerReference: 'drill-invoice-0001' });
    check('a real purchase settles and issues exactly one entitlement', settlement.status === 'PAID' && settlement.entitlementIds.length === 1);

    const afterPurchase = await entitlementCache.refreshOne(pluginId);
    check('the school fetches, verifies, and caches the real signed entitlement over live HTTP', afterPurchase.status === 'ACTIVE' && !!afterPurchase.tokenId);
    const goodTokenId = afterPurchase.tokenId;
    const goodSignedTokenJson = afterPurchase.signedTokenJson;

    await new Promise((resolve) => server.close(resolve));
    await ageCacheRow(2);
    const duringOutage = await entitlementCache.refreshOne(pluginId);
    check('an outage leaves the cached entitlement completely untouched (fail-open)', duringOutage.status === 'ACTIVE' && duringOutage.tokenId === goodTokenId && duringOutage.signedTokenJson === goodSignedTokenJson);
    check('an outage is recorded as a failure for backoff purposes', duringOutage.consecutiveFailures >= 1 && typeof duringOutage.lastError === 'string');

    app = createApp(marketplacePrisma, marketplaceConfig);
    server = http.createServer(app);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolve); });

    const liveEntitlement = await marketplacePrisma.installationEntitlement.findUnique({ where: { installationId_pluginId: { installationId: registrationRow.id, pluginId } } });
    const tamperedToken = JSON.parse(JSON.stringify(liveEntitlement.signedToken));
    tamperedToken.signature.value = Buffer.from('not-a-real-signature').toString('base64');
    await marketplacePrisma.installationEntitlement.update({ where: { id: liveEntitlement.id }, data: { signedToken: tamperedToken } });

    const auditCountBefore = await schoolPrisma.auditLog.count({ where: { action: 'entitlement_verification_failed' } });
    await ageCacheRow(6); // consecutiveFailures is 1 after the outage, needing >= 5 minutes
    const duringTamper = await entitlementCache.refreshOne(pluginId);
    check('a tampered entitlement leaves the cache untouched (fail-closed on trust, not on data access)', duringTamper.status === 'ACTIVE' && duringTamper.tokenId === goodTokenId && duringTamper.signedTokenJson === goodSignedTokenJson);
    const auditCountAfter = await schoolPrisma.auditLog.count({ where: { action: 'entitlement_verification_failed' } });
    check('the tamper attempt is written to the real audit log', auditCountAfter === auditCountBefore + 1);

    await marketplacePrisma.installationEntitlement.update({ where: { id: liveEntitlement.id }, data: { signedToken: liveEntitlement.signedToken } });
    await ageCacheRow(16); // consecutiveFailures is 2 after the tamper attempt, needing >= 15 minutes
    const recovered = await entitlementCache.refreshOne(pluginId);
    check('once the trust issue is fixed the next refresh recovers cleanly', recovered.status === 'ACTIVE' && recovered.tokenId === goodTokenId);

    const exported = await entitlementCache.exportOne(pluginId);
    check('offline export round-trips the schema the offline-import path expects', exported.schemaVersion === 1 && exported.pluginId === pluginId);
    const imported = await entitlementCache.importOne(pluginId, exported.signedToken);
    check('offline import of a genuinely exported token succeeds', imported.tokenId === goodTokenId);

    const tamperedExport = JSON.parse(JSON.stringify(exported.signedToken));
    tamperedExport.payload.expiresAt = new Date(Date.now() + 10 * 365 * 86_400_000).toISOString();
    await rejects('offline import rejects a tampered token',
      () => entitlementCache.importOne(pluginId, tamperedExport),
      /invalid/i);

    const allStatuses = await entitlementCache.getAllStatuses();
    check('getAllStatuses reflects the one plugin this drill purchased', allStatuses.some((row) => row.pluginId === pluginId));

    console.log('\n== LCF-002: signed starter-bundle install, interruption, retry, remove, reinstall ==');
    const delegatedToken = crypto.randomBytes(32).toString('hex');
    await marketplacePrisma.marketplaceSession.create({ data: {
      accountId, tokenHash: digest(delegatedToken), scope: 'COMMERCE_PROXY',
      expiresAt: new Date(Date.now() + 60 * 60_000),
    } });
    const runtime = {
      load: async () => undefined, unload: async () => undefined,
      status: () => ({ safeMode: false, loaded: [] }),
    };
    const entitlementPolicy = new PluginEntitlementPolicyService(schoolPrisma);
    const realPlugins = new PluginsService(
      schoolPrisma, new PluginPackageVerifier(), runtime, new PluginMigrationsService(),
      undefined, undefined, undefined, entitlementPolicy,
    );
    const updates = new UpdatesService(schoolPrisma, realPlugins, {}, entitlementPolicy);
    const link = { getValidAccessToken: async () => delegatedToken };
    let injectSecondInstallFailure = true;
    let installCalls = 0;
    const interruptiblePlugins = {
      install: async (...args) => {
        installCalls += 1;
        if (installCalls === 2 && injectSecondInstallFailure) {
          injectSecondInstallFailure = false;
          throw new Error('injected second-plugin failure');
        }
        return realPlugins.install(...args);
      },
      activate: (...args) => realPlugins.activate(...args),
    };
    const schoolCommerce = new MarketplaceCommerceService(
      schoolPrisma, link, updates, interruptiblePlugins, entitlementCache, entitlementPolicy,
    );
    const schoolBundles = await schoolCommerce.starterBundles();
    const schoolBundle = schoolBundles.find((candidate) => candidate.id === bundle.id);
    check('the school service resolves the same published bundle through its marketplace adapter', schoolBundle?.plugins?.length === 2);
    const installPlan = schoolBundle.plugins.map((candidate) => ({
      pluginId: candidate.pluginId, version: candidate.version,
      consentDigest: pluginInstallConsentDigest(packages.get(candidate.pluginId).manifest),
    }));
    const interrupted = await (async () => {
      try { await schoolCommerce.installBundle(bundle.id, installPlan, true); return null; }
      catch (error) { return error; }
    })();
    check('an injected second-plugin failure reports the completed first member',
      interrupted && /injected second-plugin failure/.test(interrupted.message) && interrupted.message.includes(freePluginId));
    const afterInterruption = await schoolPrisma.pluginInstallation.findMany({ orderBy: { id: 'asc' } });
    check('the completed first plugin remains active after the second member fails',
      afterInterruption.length === 1 && afterInterruption[0].id === freePluginId && afterInterruption[0].status === 'active');

    const retried = await schoolCommerce.installBundle(bundle.id, installPlan, true);
    check('retry reuses the completed member and activates both signed packages',
      retried.installed.length === 2 && installCalls === 3
      && retried.installed.every((entry) => entry.result.status === 'active'));
    await realPlugins.deactivate(freePluginId);
    const removed = await realPlugins.remove(freePluginId);
    check('independent removal preserves plugin-owned data by default', removed.status === 'removed' && removed.dataPreserved === true);
    const reinstalled = await schoolCommerce.installBundle(bundle.id, installPlan, true);
    const finalRows = await schoolPrisma.pluginInstallation.findMany({ where: { id: { in: [freePluginId, pluginId] } } });
    check('bundle reinstall restores the removed member without replacing the paid member',
      reinstalled.installed.length === 2 && finalRows.length === 2 && finalRows.every((row) => row.status === 'active'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await marketplacePrisma.$disconnect();
    await schoolPrisma.$disconnect();
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
