const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { evaluate } = require('./verify-production-external-controls');

function publicPem() {
  return generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

test('passes only with remote overlap, email, immutable storage, and release metadata', () => {
  const result = evaluate({
    METADATA_SIGNING_PROVIDER: 'remote', METADATA_SIGNING_ENDPOINT: 'https://signer.example/v1/sign',
    METADATA_SIGNING_BEARER_TOKEN: 'x'.repeat(32), METADATA_SIGNING_KEY_ID: 'next',
    METADATA_SIGNING_PUBLIC_KEYS_JSON: JSON.stringify({ current: publicPem(), next: publicPem() }),
    TRANSACTIONAL_EMAIL_PROVIDER: 'sendgrid', SENDGRID_API_KEY: 'SG.secret', TRANSACTIONAL_EMAIL_FROM: 'support@example.com',
    ARTIFACT_STORAGE_PROVIDER: 's3', ARTIFACT_S3_BUCKET: 'artifacts', ARTIFACT_S3_REGION: 'auto', APP_VERSION: '0.1.0-a2d10ba',
  });
  assert.equal(result.pass, true);
});

test('reports unsafe production exceptions without exposing secret values', () => {
  const result = evaluate({ METADATA_SIGNING_PRIVATE_KEY: 'private-secret', TRANSACTIONAL_EMAIL_PROVIDER: 'disabled', ALLOW_MFA_ONLY_PRODUCTION: 'true', APP_VERSION: '0.1.0-dev' });
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((item) => item.control === 'local_repository_private_key_removed' && item.status === 'FAIL'));
  assert.ok(result.findings.some((item) => item.control === 'mfa_only_exception_removed' && item.status === 'FAIL'));
  assert.equal(JSON.stringify(result).includes('private-secret'), false);
});
