#!/usr/bin/env node

const { createPublicKey } = require('node:crypto');

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parsePublicKeys(raw, findings) {
  if (!configured(raw)) return [];
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('must be an object');
    return Object.entries(value).map(([keyId, publicKeyPem]) => {
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(keyId) || typeof publicKeyPem !== 'string') throw new Error('contains an invalid key');
      const normalized = publicKeyPem.replace(/\\n/g, '\n');
      const key = createPublicKey(normalized);
      if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${keyId} is not Ed25519`);
      return { keyId, der: key.export({ type: 'spki', format: 'der' }).toString('base64') };
    });
  } catch (error) {
    findings.push({ control: 'repository_public_keys', status: 'FAIL', detail: `METADATA_SIGNING_PUBLIC_KEYS_JSON is invalid: ${error.message}` });
    return [];
  }
}

function evaluate(env = process.env) {
  const findings = [];
  const add = (control, ok, detail) => findings.push({ control, status: ok ? 'PASS' : 'FAIL', detail });
  const remote = env.METADATA_SIGNING_PROVIDER === 'remote';
  add('remote_repository_signer', remote, remote ? 'remote provider selected' : 'production still uses local repository signing');
  add('remote_signer_https', remote && /^https:\/\//.test(env.METADATA_SIGNING_ENDPOINT || ''), 'remote signer endpoint must be configured with HTTPS');
  add('remote_signer_authentication', remote && configured(env.METADATA_SIGNING_BEARER_TOKEN) && env.METADATA_SIGNING_BEARER_TOKEN.trim().length >= 32, 'remote signer bearer credential must contain at least 32 characters');
  add('local_repository_private_key_removed', !configured(env.METADATA_SIGNING_PRIVATE_KEY) && !configured(env.METADATA_SIGNING_PRIVATE_KEY_FILE) && !configured(env.METADATA_SECONDARY_SIGNING_KEYS_JSON) && !configured(env.METADATA_SECONDARY_SIGNING_KEYS_BASE64), 'no repository private key material may remain in Marketplace production');
  const keys = parsePublicKeys(env.METADATA_SIGNING_PUBLIC_KEYS_JSON, findings);
  const activeKeyPresent = keys.some((key) => key.keyId === env.METADATA_SIGNING_KEY_ID);
  const uniqueMaterial = new Set(keys.map((key) => key.der)).size === keys.length;
  add('two_key_signing_overlap', keys.length >= 2 && activeKeyPresent && uniqueMaterial, 'at least two distinct Ed25519 public keys must be trusted and include the active key');
  const emailEnabled = env.TRANSACTIONAL_EMAIL_PROVIDER === 'sendgrid';
  add('transactional_email_provider', emailEnabled, emailEnabled ? 'SendGrid provider selected' : 'transactional email is not enabled');
  add('transactional_email_credentials', emailEnabled && configured(env.SENDGRID_API_KEY) && configured(env.TRANSACTIONAL_EMAIL_FROM), 'provider credential and sender address must be configured');
  add('mfa_only_exception_removed', env.ALLOW_MFA_ONLY_PRODUCTION !== 'true', 'ALLOW_MFA_ONLY_PRODUCTION must not permit the production email exception');
  const s3 = env.ARTIFACT_STORAGE_PROVIDER === 's3';
  add('immutable_shared_artifact_storage', s3 && configured(env.ARTIFACT_S3_BUCKET) && configured(env.ARTIFACT_S3_REGION), 'S3-compatible artifact storage must be configured');
  const version = env.APP_VERSION || '';
  add('traceable_release_version', configured(version) && !/(^|[-.])dev($|[-.])/i.test(version) && version !== '0.1.0', 'APP_VERSION must identify a non-development release');
  return { schemaVersion: 1, checkedAt: new Date().toISOString(), pass: findings.every((item) => item.status === 'PASS'), findings };
}

if (require.main === module) {
  const result = evaluate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass && !process.argv.includes('--report-only')) process.exitCode = 1;
}

module.exports = { evaluate };
