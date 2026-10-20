import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readConfig } from './config';

function privateKey() {
  return generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function environment(repositoryKey: string, entitlementKey: string) {
  return {
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://test', PUBLIC_BASE_URL: 'https://marketplace.example',
    MARKETPLACE_ADMIN_TOKEN: 'a'.repeat(32), METADATA_SIGNING_PRIVATE_KEY: repositoryKey,
    METADATA_SIGNING_KEY_ID: 'repository-1', ENTITLEMENT_SIGNING_PRIVATE_KEY: entitlementKey,
    ENTITLEMENT_SIGNING_KEY_ID: 'entitlement-1', ARTIFACT_STORAGE_PATH: path.join(tmpdir(), 'wattanam-marketplace-config-test'),
    PAYMENT_WEBHOOK_SECRET: 'w'.repeat(32),
  };
}

describe('marketplace signing configuration', () => {
  it('accepts independently generated repository and entitlement keys', () => {
    const config = readConfig(environment(privateKey(), privateKey()));
    expect(config.entitlementKeyId).toBe('entitlement-1');
  });

  it('normalizes an accidental UTF-8 BOM around the admin bearer token', () => {
    const env = environment(privateKey(), privateKey());
    env.MARKETPLACE_ADMIN_TOKEN = `\uFEFF${'a'.repeat(32)} `;
    expect(readConfig(env).adminTokens).toEqual(['a'.repeat(32)]);
  });

  it('rejects reuse of the repository key for entitlements', () => {
    const key = privateKey();
    expect(() => readConfig(environment(key, key))).toThrow('must be distinct');
  });

  it('loads a distinct secondary repository key for rotation overlap', () => {
    const env = environment(privateKey(), privateKey());
    (env as Record<string, string>).METADATA_SECONDARY_SIGNING_KEYS_JSON = JSON.stringify({ 'repository-old': privateKey() });
    expect(readConfig(env).signingKeys.map((key) => key.keyId)).toEqual(['repository-1', 'repository-old']);
  });

  it('loads base64-transported secondary keys without multiline environment corruption', () => {
    const env = environment(privateKey(), privateKey());
    const json = JSON.stringify({ 'repository-old': privateKey() });
    (env as Record<string, string>).METADATA_SECONDARY_SIGNING_KEYS_BASE64 = Buffer.from(json).toString('base64');
    expect(readConfig(env).signingKeys.map((key) => key.keyId)).toEqual(['repository-1', 'repository-old']);
  });

  it('supports a remote KMS adapter without loading repository private keys', () => {
    const repository = generateKeyPairSync('ed25519');
    const publicKeyPem = repository.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const env = environment(privateKey(), privateKey()) as Record<string, string>;
    delete env.METADATA_SIGNING_PRIVATE_KEY;
    env.METADATA_SIGNING_PROVIDER = 'remote';
    env.METADATA_SIGNING_ENDPOINT = 'https://signer.example/v1/sign';
    env.METADATA_SIGNING_BEARER_TOKEN = 's'.repeat(32);
    env.METADATA_SIGNING_PUBLIC_KEYS_JSON = JSON.stringify({ 'repository-1': publicKeyPem });
    const config = readConfig(env);
    expect(config.signingProvider).toBe('remote');
    expect(config.signingPrivateKey).toBeUndefined();
    expect(config.signingPublicKeys).toEqual([{ keyId: 'repository-1', publicKeyPem }]);
  });

  it('requires both SendGrid credentials when transactional email is enabled', () => {
    const env = environment(privateKey(), privateKey());
    (env as Record<string, string>).TRANSACTIONAL_EMAIL_PROVIDER = 'sendgrid';
    expect(() => readConfig(env)).toThrow('SENDGRID_API_KEY and TRANSACTIONAL_EMAIL_FROM');
    (env as Record<string, string>).SENDGRID_API_KEY = 'SG.'.padEnd(24, 'x');
    (env as Record<string, string>).TRANSACTIONAL_EMAIL_FROM = 'support@wattanam.example';
    expect(readConfig(env).transactionalEmail.provider).toBe('sendgrid');
  });

  it('fails closed when transactional delivery is disabled in production', () => {
    const env = environment(privateKey(), privateKey());
    (env as Record<string, string>).NODE_ENV = 'production';
    (env as Record<string, string>).IDENTITY_ENCRYPTION_KEYS_JSON = JSON.stringify({ active: Buffer.alloc(32, 1).toString('base64') });
    (env as Record<string, string>).IDENTITY_ENCRYPTION_ACTIVE_KEY_ID = 'active';
    expect(() => readConfig(env)).toThrow('TRANSACTIONAL_EMAIL_PROVIDER must be configured');
  });

  it('allows an explicitly accepted MFA-only production deployment without email', () => {
    const env = environment(privateKey(), privateKey());
    (env as Record<string, string>).NODE_ENV = 'production';
    (env as Record<string, string>).IDENTITY_ENCRYPTION_KEYS_JSON = JSON.stringify({ active: Buffer.alloc(32, 1).toString('base64') });
    (env as Record<string, string>).IDENTITY_ENCRYPTION_ACTIVE_KEY_ID = 'active';
    (env as Record<string, string>).ALLOW_MFA_ONLY_PRODUCTION = 'true';
    expect(readConfig(env).transactionalEmail.provider).toBe('disabled');
  });
});
