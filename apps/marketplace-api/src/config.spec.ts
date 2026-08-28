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

  it('rejects reuse of the repository key for entitlements', () => {
    const key = privateKey();
    expect(() => readConfig(environment(key, key))).toThrow('must be distinct');
  });
});
