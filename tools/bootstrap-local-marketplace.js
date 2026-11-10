'use strict';

const { generateKeyPairSync, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const secretsDir = path.join(root, '.local-secrets');
const envPath = path.join(root, '.env.compose.local');

function privateKey(name) {
  const target = path.join(secretsDir, name);
  if (fs.existsSync(target)) return;
  const { privateKey: key } = generateKeyPairSync('ed25519');
  fs.writeFileSync(target, key.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}

function secret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

fs.mkdirSync(secretsDir, { recursive: true });
privateKey('repository-signing-private.pem');
privateKey('entitlement-signing-private.pem');

if (!fs.existsSync(envPath)) {
  const env = [
    'NODE_ENV=development',
    'APP_VERSION=0.1.0-local',
    'PORT=3010',
    'PUBLIC_BASE_URL=http://localhost:3010',
    `POSTGRES_PASSWORD=${secret()}`,
    `MARKETPLACE_ADMIN_TOKEN=${secret(48)}`,
    'METADATA_SIGNING_PROVIDER=local',
    'METADATA_SIGNING_KEY_ID=local-repository',
    'ENTITLEMENT_SIGNING_KEY_ID=local-entitlement',
    `PAYMENT_WEBHOOK_SECRET=${secret(48)}`,
    'ARTIFACT_STORAGE_PROVIDER=local',
    'ARTIFACT_STORAGE_PATH=/data/artifacts',
    'TRANSACTIONAL_EMAIL_PROVIDER=disabled',
    '',
  ].join('\n');
  fs.writeFileSync(envPath, env, { mode: 0o600 });
}

// Customer MFA secrets are encrypted with this keyring; without it the marketplace refuses to
// enroll MFA at all. Added to existing local env files too (they predate this key).
const current = fs.readFileSync(envPath, 'utf8');
if (!/^IDENTITY_ENCRYPTION_KEYS_JSON=/m.test(current)) {
  const keyring = JSON.stringify({ 'local-identity': randomBytes(32).toString('base64') });
  const addition = `IDENTITY_ENCRYPTION_KEYS_JSON=${keyring}\nIDENTITY_ENCRYPTION_ACTIVE_KEY_ID=local-identity\n`;
  fs.writeFileSync(envPath, `${current.replace(/\n?$/, '\n')}${addition}`, { mode: 0o600 });
  process.stdout.write('Added a local identity encryption keyring to the existing env file.\n');
}

process.stdout.write('Local Marketplace credentials and distinct Ed25519 keys are ready.\n');
process.stdout.write('Run: npm run local:up\n');
