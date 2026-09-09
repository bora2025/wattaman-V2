/**
 * Creates — or, deliberately, re-credentials — a marketplace *customer* account on a deployed
 * environment.
 *
 * This is the commercial identity a school's owner signs in with: it buys plugins, approves the
 * marketplace link that claims a school, and raises plugin requests. It is a different identity
 * from a `PlatformOperator`, which runs the platform and can never act as a customer.
 *
 * The normal path is self-service signup with emailed verification. This exists for the case that
 * path cannot run — a marketplace with no mail provider configured, or an account whose owner has
 * lost access — and it is piped in over SSH rather than exposed as an endpoint so that minting a
 * customer identity requires deploy access at the moment it happens.
 *
 *   # Show what already exists (run this first — a duplicate identity is worse than none):
 *   railway ssh --project <id> --service marketplace-api -i ~/.ssh/<key> \
 *     node < scripts/create-marketplace-account.js
 *
 *   # Create:
 *   PAYLOAD=$(printf '%s' '{"email":"owner@example.com","name":"Owner Name"}' | base64 -w0)
 *   railway ssh --project <id> --service marketplace-api -i ~/.ssh/<key> \
 *     env MARKETPLACE_ACCOUNT_B64=$PAYLOAD node < scripts/create-marketplace-account.js
 *
 *   # Re-credential an existing account (add "reset": true) — see the warning below.
 *
 * A password is generated here rather than accepted, because the value is shown exactly once and
 * is meant to be replaced at first sign-in; accepting one invites reuse of a password the operator
 * already has. Supply `"password"` explicitly only when a password manager generated it.
 *
 * The TOTP secret is always freshly generated and is never the platform operator's: separate
 * identities must not share a second factor, or compromising one compromises both.
 */
const APP = process.env.PLATFORM_APP_ROOT || '/app';
const crypto = require('crypto');
const { PrismaClient } = require(`${APP}/node_modules/@prisma/client`);
const { hashPassword, generateTotpSecret, generateRecoveryCodes, hashToken, totpUri } = require(`${APP}/dist/identity-crypto`);
const { encryptSecret, parseSecretEncryptionKeys } = require(`${APP}/dist/secret-encryption`);

/** `railway ssh` re-splits its command on whitespace, so inputs arrive base64-encoded. */
function inputs() {
  const encoded = process.env.MARKETPLACE_ACCOUNT_B64;
  if (encoded) return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  return {
    email: process.env.MARKETPLACE_ACCOUNT_EMAIL,
    name: process.env.MARKETPLACE_ACCOUNT_NAME,
    password: process.env.MARKETPLACE_ACCOUNT_PASSWORD,
    reset: process.env.MARKETPLACE_ACCOUNT_RESET === 'true',
  };
}

const given = inputs();
const email = (given.email || '').trim().toLowerCase();
const displayName = (given.name || '').trim();
const suppliedPassword = (given.password || '').trim();
const reset = given.reset === true;

/** Ambiguous characters are excluded because this value gets read off a screen and retyped. */
function generatePassword(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_';
  const bytes = crypto.randomBytes(length * 2);
  let value = '';
  for (let i = 0; value.length < length; i += 1) value += alphabet[bytes[i % bytes.length] % alphabet.length];
  return value;
}

function encryptionKeys() {
  const keys = parseSecretEncryptionKeys(process.env.IDENTITY_ENCRYPTION_KEYS_JSON, process.env.IDENTITY_ENCRYPTION_ACTIVE_KEY_ID);
  // Storing a TOTP secret in the clear would be a downgrade this script must not make silently.
  if (keys.length === 0) throw new Error('IDENTITY_ENCRYPTION_KEYS_JSON is not configured; refusing to store an MFA secret unencrypted');
  return keys;
}

async function listing(prisma) {
  const accounts = await prisma.marketplaceAccount.findMany({
    select: {
      id: true, email: true, displayName: true, emailVerifiedAt: true, mfaEnabled: true, lockedUntil: true,
      _count: { select: { installations: true, orders: true, marketplaceGrants: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return accounts.map((account) => ({
    id: account.id,
    email: account.email.replace(/^(.)[^@]*/, '$1***'),
    name: account.displayName,
    verified: Boolean(account.emailVerifiedAt),
    mfaEnabled: account.mfaEnabled,
    locked: Boolean(account.lockedUntil),
    installations: account._count.installations,
    grants: account._count.marketplaceGrants,
    orders: account._count.orders,
  }));
}

async function main() {
  const prisma = new PrismaClient();
  try {
    if (!email) {
      console.log(JSON.stringify({
        accounts: await listing(prisma),
        nextStep: 'Re-run with MARKETPLACE_ACCOUNT_B64 set to base64 of {"email":"...","name":"..."}.',
        note: 'An account already listed here does not need creating. Linking a school to it is a consent flow in the marketplace portal, not a database change.',
      }, null, 2));
      return;
    }
    if (!displayName && !reset) throw new Error('Set a name for a new account');
    if (suppliedPassword && suppliedPassword.length < 12) throw new Error('A supplied password must be at least 12 characters');

    const existing = await prisma.marketplaceAccount.findUnique({ where: { email }, select: { id: true, mfaEnabled: true } });
    if (existing && !reset) {
      throw new Error(`An account already exists for ${email}. Creating a second identity for one person splits their schools, orders, and grants across two accounts. Re-run with "reset": true only if the intent is to replace this account's credentials.`);
    }
    if (!existing && reset) throw new Error(`No account exists for ${email}; drop "reset" to create one`);

    const password = suppliedPassword || generatePassword();
    const passwordHash = await hashPassword(password);
    const totpSecret = generateTotpSecret();
    const encryptedSecret = encryptSecret(totpSecret, encryptionKeys());
    const recoveryCodes = generateRecoveryCodes();
    const now = new Date();

    const account = await prisma.$transaction(async (tx) => {
      const record = existing
        ? await tx.marketplaceAccount.update({
          where: { id: existing.id },
          data: {
            ...(displayName ? { displayName } : {}),
            passwordHash, mfaSecret: encryptedSecret, mfaEnabled: true,
            failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: now,
          },
          select: { id: true, email: true, displayName: true },
        })
        : await tx.marketplaceAccount.create({
          data: {
            email, displayName, passwordHash,
            // Verified on creation because the emailed verification this replaces cannot run here,
            // and an unverified account is refused by the plugin-request and link flows.
            emailVerifiedAt: now, mfaSecret: encryptedSecret, mfaEnabled: true,
          },
          select: { id: true, email: true, displayName: true },
        });

      if (existing) {
        // Old factors and live sessions must not survive a credential replacement, or the previous
        // holder keeps the access this was run to take back.
        await tx.marketplaceMfaRecoveryCode.deleteMany({ where: { accountId: record.id } });
        await tx.marketplaceSession.updateMany({ where: { accountId: record.id, revokedAt: null }, data: { revokedAt: now } });
      }
      await tx.marketplaceMfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ accountId: record.id, codeHash: hashToken(code) })),
      });
      await tx.marketplaceAuditEvent.create({
        data: {
          accountId: record.id,
          action: existing ? 'account_credentials_replaced_via_cli' : 'account_created_via_cli',
          success: true, metadata: { mfaEnrolled: true, sessionsRevoked: Boolean(existing) },
        },
      });
      return record;
    });

    console.log(JSON.stringify({
      [existing ? 'replaced' : 'created']: { id: account.id, email: account.email, name: account.displayName },
      credentials: {
        password,
        totpSecret,
        otpauthUri: totpUri(totpSecret, account.email),
        recoveryCodes,
      },
      warning: 'Shown once and not recoverable. Store in a password manager, add the TOTP secret to an authenticator, and change the password after signing in.',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
