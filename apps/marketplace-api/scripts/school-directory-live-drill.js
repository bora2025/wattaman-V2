/**
 * School directory and enrollment claim live drill, run against REAL PostgreSQL databases (one per
 * service) with the marketplace's real Express app listening on a real HTTP port and the school's
 * real NestJS service classes making real signed HTTP calls to it.
 *
 * Every unit test of this feature runs against mocked Prisma transactions. This drill is the only
 * place the whole path is exercised end to end: an operator signs in through MFA, creates a
 * customer school, mints a one-time enrollment token, and a real school backend redeems it with a
 * real Ed25519 registration signature — so a mismatch between the two sides' idea of the token, or
 * of the transaction ordering, shows up here rather than in production.
 *
 * Prerequisites (not started by this script):
 *   - `npm run build` in both apps/marketplace-api and backend (this script requires their
 *     compiled dist/ output directly, matching how the compiled artifacts are actually deployed).
 *   - `npx prisma generate` in both projects against the current schema.
 *   - Two empty, migrated PostgreSQL 16 databases reachable from this process.
 *
 * Run (from apps/marketplace-api):
 *   MARKETPLACE_DATABASE_URL=postgresql://user:pass@host:port/marketplace_db \
 *   SCHOOL_DATABASE_URL=postgresql://user:pass@host:port/school_db \
 *   node scripts/school-directory-live-drill.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const backendRoot = path.resolve(__dirname, '../../../backend');
require(path.join(backendRoot, 'node_modules/reflect-metadata'));

const { PrismaClient: MarketplacePrismaClient } = require('@prisma/client');
const { createApp } = require('../dist/app');
const { readConfig } = require('../dist/config');
const { hashPassword, totpCode } = require('../dist/identity-crypto');
const { PLATFORM_PERMISSIONS, PLATFORM_ROLES } = require('../dist/platform-rbac-seed');

const { PrismaClient: SchoolPrismaClient } = require(path.join(backendRoot, 'node_modules/@prisma/client'));
const { InstallationKeyService } = require(path.join(backendRoot, 'dist/marketplace/installation-key.service'));
const { InstallationRegistrationService } = require(path.join(backendRoot, 'dist/marketplace/installation-registration.service'));

const MARKETPLACE_DATABASE_URL = required('MARKETPLACE_DATABASE_URL');
const SCHOOL_DATABASE_URL = required('SCHOOL_DATABASE_URL');
const PORT = Number(process.env.DRILL_PORT || 4310);
const BASE = `http://127.0.0.1:${PORT}`;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const results = [];
function check(step, ok, detail = '') {
  results.push({ step, ok });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ` -- ${detail}` : ''}\n`);
}

function pemLine(key) {
  return String(key.export({ type: 'pkcs8', format: 'pem' })).replace(/\n/g, '\\n');
}

function buildConfig(artifactPath) {
  const metadata = crypto.generateKeyPairSync('ed25519');
  const entitlement = crypto.generateKeyPairSync('ed25519');
  return readConfig({
    NODE_ENV: 'test',
    PORT: String(PORT),
    DATABASE_URL: MARKETPLACE_DATABASE_URL,
    PUBLIC_BASE_URL: 'https://marketplace.drill.invalid',
    MARKETPLACE_ADMIN_TOKEN: crypto.randomBytes(36).toString('base64url'),
    METADATA_SIGNING_PRIVATE_KEY: pemLine(metadata.privateKey),
    METADATA_SIGNING_KEY_ID: 'metadata-drill',
    ENTITLEMENT_SIGNING_PRIVATE_KEY: pemLine(entitlement.privateKey),
    ENTITLEMENT_SIGNING_KEY_ID: 'entitlement-drill',
    PAYMENT_WEBHOOK_SECRET: crypto.randomBytes(36).toString('base64url'),
    ARTIFACT_STORAGE_PATH: artifactPath,
    IDENTITY_ENCRYPTION_ACTIVE_KEY_ID: 'identity-drill',
    IDENTITY_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'identity-drill': crypto.randomBytes(32).toString('base64') }),
  });
}

/** Idempotent, and identical to what bootstrap-platform-owner.ts seeds. */
async function seedRbac(prisma) {
  for (const permission of PLATFORM_PERMISSIONS) {
    await prisma.platformPermission.upsert({ where: { key: permission.key }, create: permission, update: {} });
  }
  for (const role of PLATFORM_ROLES) {
    const record = await prisma.platformRole.upsert({
      where: { key: role.key },
      create: { key: role.key, displayName: role.displayName, description: role.description },
      update: {},
    });
    for (const key of role.permissions) {
      const permission = await prisma.platformPermission.findUniqueOrThrow({ where: { key } });
      await prisma.platformRolePermission.upsert({
        where: { roleId_permissionId: { roleId: record.id, permissionId: permission.id } },
        create: { roleId: record.id, permissionId: permission.id },
        update: {},
      });
    }
  }
}

async function createOperator(prisma, email, roleKey) {
  const role = await prisma.platformRole.findUniqueOrThrow({ where: { key: roleKey } });
  const password = `drill-${crypto.randomBytes(12).toString('hex')}`;
  await prisma.platformOperator.create({
    data: { email, displayName: `Drill ${roleKey}`, passwordHash: await hashPassword(password), roles: { create: { roleId: role.id } } },
  });
  return { email, password };
}

async function api(pathname, init = {}) {
  const { token, ...rest } = init;
  const response = await fetch(`${BASE}${pathname}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

/** The TOTP counter, not a number of seconds -- `totpCode` takes the step directly. */
function currentTotpStep(now = Date.now()) {
  return Math.floor(now / 1000 / 30);
}

/**
 * Walks the real mandatory-MFA path rather than writing an operator's second factor into the
 * database by hand. The secret is stored encrypted at rest, so a hand-written row would not be
 * readable by the login code anyway -- and enrolling for real also proves that a brand-new
 * operator genuinely cannot reach anything until they have a second factor.
 */
async function enrollAndSignIn(operator) {
  const first = await api('/platform/v1/auth/sessions', {
    method: 'POST', body: JSON.stringify({ email: operator.email, password: operator.password }),
  });
  if (first.body.status !== 'mfa_enrollment_required') throw new Error(`expected enrollment, got ${JSON.stringify(first.body)}`);
  const token = first.body.sessionToken;
  const enrolled = await api('/platform/v1/auth/mfa/enroll', { method: 'POST', token });
  const secret = enrolled.body.secret;
  const confirmed = await api('/platform/v1/auth/mfa/enroll/confirm', {
    method: 'POST', token, body: JSON.stringify({ code: totpCode(secret, currentTotpStep()) }),
  });
  if (!confirmed.body.enabled) throw new Error(`MFA enrollment failed: ${JSON.stringify(confirmed.body)}`);
  return { token, secret };
}

async function signIn(operator, secret) {
  const response = await api('/platform/v1/auth/sessions', {
    method: 'POST',
    body: JSON.stringify({ email: operator.email, password: operator.password, code: totpCode(secret, currentTotpStep()) }),
  });
  return response.body.sessionToken;
}

/**
 * A school registering through its own real service, exactly as a deployed school does: its own
 * Prisma client, its own on-disk Ed25519 key, its own HTTP call.
 */
async function schoolRegistration(schoolPrisma, keyDir, installationId) {
  await schoolPrisma.installation.deleteMany({});
  await schoolPrisma.installation.create({
    data: { id: 'singleton', installationId, schoolName: 'Drill School', schoolSlug: `drill-${installationId.slice(0, 8)}`, coreVersion: '0.1.0-drill' },
  });
  fs.rmSync(keyDir, { recursive: true, force: true });
  fs.mkdirSync(keyDir, { recursive: true });
  process.env.MARKETPLACE_URL = BASE;
  process.env.INSTALLATION_KEY_DIR = keyDir;
  const keys = new InstallationKeyService();
  return new InstallationRegistrationService(schoolPrisma, keys);
}

async function main() {
  const artifactPath = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-artifacts-'));
  const keyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-keys-'));
  const prisma = new MarketplacePrismaClient({ datasources: { db: { url: MARKETPLACE_DATABASE_URL } } });
  const schoolPrisma = new SchoolPrismaClient({ datasources: { db: { url: SCHOOL_DATABASE_URL } } });
  const server = createApp(prisma, buildConfig(artifactPath)).listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    await seedRbac(prisma);
    const operator = await createOperator(prisma, 'drill.operator@example.com', 'marketplace_operator');
    const auditor = await createOperator(prisma, 'drill.auditor@example.com', 'auditor');
    const account = await prisma.marketplaceAccount.create({
      data: {
        email: 'principal@drill.example', displayName: 'Drill Principal',
        passwordHash: await hashPassword(`drill-${crypto.randomBytes(12).toString('hex')}`), emailVerifiedAt: new Date(),
      },
    });

    // ── A new operator cannot act until they hold a second factor ───────
    const preEnrollment = await api('/platform/v1/auth/sessions', {
      method: 'POST', body: JSON.stringify({ email: operator.email, password: operator.password }),
    });
    const unenrolled = await api('/platform/v1/schools', { token: preEnrollment.body.sessionToken });
    check('an operator without a second factor reaches nothing', preEnrollment.body.status === 'mfa_enrollment_required' && unenrolled.status === 403,
      `${preEnrollment.body.status}, directory HTTP ${unenrolled.status}`);

    const enrollment = await enrollAndSignIn(operator);
    const noCode = await api('/platform/v1/auth/sessions', {
      method: 'POST', body: JSON.stringify({ email: operator.email, password: operator.password }),
    });
    check('once enrolled, sign-in demands the second factor', noCode.body.status === 'mfa_required', `status field: ${noCode.body.status}`);
    const token = await signIn(operator, enrollment.secret);
    check('operator holds a verified session', Boolean(token));

    // ── 1. The school record exists before any infrastructure does ────────
    const created = await api('/platform/v1/schools', {
      method: 'POST', token,
      body: JSON.stringify({
        name: 'Angkor High School', slug: 'angkor-high', region: 'Siem Reap', plan: 'standard',
        contactEmail: 'Head@Angkor.example', internalReason: 'Signed contract 2026-09-03.',
      }),
    });
    check('school created in PROSPECT', created.status === 201 && created.body.status === 'PROSPECT', `HTTP ${created.status}, lifecycle ${created.body.status}`);
    check('the contact address is masked in the response', created.body.contactEmail === 'h***@angkor.example', String(created.body.contactEmail));
    const schoolId = created.body.id;

    const duplicate = await api('/platform/v1/schools', {
      method: 'POST', token, body: JSON.stringify({ name: 'Another', slug: 'angkor-high', internalReason: 'Double submit.' }),
    });
    check('a duplicate slug conflicts instead of creating a second record', duplicate.status === 409, `HTTP ${duplicate.status}`);

    // ── 2. Mint the one-time token ────────────────────────────────────────
    const minted = await api(`/platform/v1/schools/${schoolId}/enrollment-tokens`, {
      method: 'POST', token, body: JSON.stringify({ internalReason: 'Handing to the deployment engineer.' }),
    });
    const enrollmentToken = minted.body.token;
    check('token minted and shown once', minted.status === 201 && /^wtn_enr_[0-9a-f]{64}$/.test(enrollmentToken || ''), `HTTP ${minted.status}`);

    const storedToken = await prisma.schoolEnrollmentToken.findFirstOrThrow({ where: { customerSchoolId: schoolId } });
    check('only the hash reaches the database', storedToken.tokenHash !== enrollmentToken && storedToken.tokenHash.length === 64);

    const secondMint = await api(`/platform/v1/schools/${schoolId}/enrollment-tokens`, {
      method: 'POST', token, body: JSON.stringify({ internalReason: 'Second copy.' }),
    });
    check('a second live token is refused', secondMint.status === 409, `HTTP ${secondMint.status}`);

    const awaiting = await api(`/platform/v1/schools/${schoolId}`, { token });
    check('school moved to AWAITING_CLAIM', awaiting.body.status === 'AWAITING_CLAIM', String(awaiting.body.status));

    // ── 3. A real school backend redeems it ───────────────────────────────
    const installationId = crypto.randomUUID();
    const registration = await schoolRegistration(schoolPrisma, path.join(keyRoot, 'claimed'), installationId);
    const registered = await registration.register(account.id, 'Angkor High School', `  ${enrollmentToken}  `);
    check('the school registers with the token and is told which customer it is', registered.school && registered.school.slug === 'angkor-high', JSON.stringify(registered.school));

    const claimed = await api(`/platform/v1/schools/${schoolId}`, { token });
    check('the school is ACTIVE and bound to that installation',
      claimed.body.status === 'ACTIVE' && claimed.body.installation && claimed.body.installation.installationId === installationId,
      `${claimed.body.status}, installation ${claimed.body.installation && claimed.body.installation.installationId}`);
    check('the console shows a name where it used to show a bare UUID', claimed.body.name === 'Angkor High School', claimed.body.name);

    // ── 4. The token cannot be replayed onto a second deployment ──────────
    const replayInstallationId = crypto.randomUUID();
    const replayRegistration = await schoolRegistration(schoolPrisma, path.join(keyRoot, 'replay'), replayInstallationId);
    let replayError = null;
    await replayRegistration.register(account.id, 'Impostor', enrollmentToken).catch((error) => { replayError = error; });
    check('a consumed token is refused on another installation', Boolean(replayError) && /not valid/.test(String(replayError && replayError.message)), String(replayError && replayError.message));
    const stillUnbound = await prisma.installationRegistration.findUnique({ where: { installationId: replayInstallationId } });
    check('the rejected registration left nothing behind', stillUnbound === null);

    // ── 5. Registration without a token is unchanged ──────────────────────
    const legacyInstallationId = crypto.randomUUID();
    const legacyRegistration = await schoolRegistration(schoolPrisma, path.join(keyRoot, 'legacy'), legacyInstallationId);
    const legacy = await legacyRegistration.register(account.id, 'Bora School');
    check('a school with no token registers exactly as before', Boolean(legacy.keyFingerprint) && !legacy.school, JSON.stringify(legacy.school || null));

    // ── 6. Adopting a deployment that predates the directory ──────────────
    const bora = await api('/platform/v1/schools', {
      method: 'POST', token, body: JSON.stringify({ name: 'Bora School', slug: 'bora-school', internalReason: 'Existing customer, registered before the directory.' }),
    });
    const adopted = await api(`/platform/v1/schools/${bora.body.id}/adopt-installation`, {
      method: 'POST', token, body: JSON.stringify({ installationId: legacyInstallationId, internalReason: 'Backfilling an existing deployment.' }),
    });
    check('an existing registration can be adopted', adopted.status === 200 && adopted.body.status === 'ACTIVE', `HTTP ${adopted.status}, lifecycle ${adopted.body.status}`);

    const third = await api('/platform/v1/schools', {
      method: 'POST', token, body: JSON.stringify({ name: 'Third School', slug: 'third-school', internalReason: 'Adoption conflict check.' }),
    });
    const conflict = await api(`/platform/v1/schools/${third.body.id}/adopt-installation`, {
      method: 'POST', token, body: JSON.stringify({ installationId: legacyInstallationId, internalReason: 'Should be refused.' }),
    });
    check('one installation cannot be adopted by two schools', conflict.status === 409, `HTTP ${conflict.status}`);

    // ── 7. Authorization and audit ────────────────────────────────────────
    const anonymous = await api('/platform/v1/schools');
    check('the directory requires a session', anonymous.status === 401, `HTTP ${anonymous.status}`);

    const auditorEnrollment = await enrollAndSignIn(auditor);
    const auditorToken = auditorEnrollment.token;
    const auditorRead = await api('/platform/v1/schools', { token: auditorToken });
    const auditorWrite = await api('/platform/v1/schools', {
      method: 'POST', token: auditorToken, body: JSON.stringify({ name: 'Nope', slug: 'nope', internalReason: 'Should be denied.' }),
    });
    check('an auditor may read the directory', auditorRead.status === 200, `HTTP ${auditorRead.status}`);
    check('an auditor may not create a school', auditorWrite.status === 403, `HTTP ${auditorWrite.status}: ${auditorWrite.body.error}`);

    const audits = await prisma.platformAuditEvent.findMany({ where: { targetType: 'CustomerSchool' } });
    const actions = audits.map((row) => row.action).sort();
    check('every directory mutation is audited with an operator, reason, and correlation id',
      audits.every((row) => row.operatorId && row.reason && row.correlationId),
      `${audits.length} rows`);
    // Exactly the five that succeeded. The rejected duplicate slug, the rejected second mint, and
    // the rejected second adoption each left no row: a failed validation is not an audit event,
    // and logging them would bury the real ones.
    check('rejected mutations leave no audit noise',
      JSON.stringify(actions) === JSON.stringify([
        'customer_school_created', 'customer_school_created', 'customer_school_created',
        'customer_school_installation_adopted', 'school_enrollment_token_minted',
      ]),
      actions.join(', '));

    const claimedFilter = await api('/platform/v1/schools?claimed=true', { token });
    check('the claimed filter returns only bound schools', claimedFilter.body.items && claimedFilter.body.items.length === 2, `${claimedFilter.body.items && claimedFilter.body.items.length} items`);
  } finally {
    server.close();
    await prisma.$disconnect();
    await schoolPrisma.$disconnect();
    fs.rmSync(keyRoot, { recursive: true, force: true });
    fs.rmSync(artifactPath, { recursive: true, force: true });
  }

  const failed = results.filter((row) => !row.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
