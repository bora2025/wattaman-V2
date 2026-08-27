import { generateKeyPairSync } from 'crypto';
import { readUpdateRepositoryConfig } from './update-config';

const publicKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();

describe('update repository configuration', () => {
  it('is disabled unless a repository is explicitly configured', () => {
    expect(readUpdateRepositoryConfig({ NODE_ENV: 'production' })).toBeNull();
  });

  it('requires HTTPS and a pinned key in production', () => {
    expect(() => readUpdateRepositoryConfig({
      NODE_ENV: 'production', MARKETPLACE_URL: 'http://marketplace.example.com',
      UPDATE_REPOSITORY_PUBLIC_KEY: publicKey, UPDATE_REPOSITORY_KEY_ID: 'official',
    })).toThrow('HTTPS');
    expect(() => readUpdateRepositoryConfig({ NODE_ENV: 'production', MARKETPLACE_URL: 'https://marketplace.example.com' })).toThrow('pinned');
  });

  it('loads a pinned inline key and release channel', () => {
    expect(readUpdateRepositoryConfig({
      NODE_ENV: 'production', MARKETPLACE_URL: 'https://marketplace.example.com',
      UPDATE_REPOSITORY_PUBLIC_KEY: publicKey, UPDATE_REPOSITORY_KEY_ID: 'official-2026', UPDATE_CHANNEL: 'beta',
    })).toMatchObject({ url: 'https://marketplace.example.com', keyId: 'official-2026', channel: 'beta' });
  });
});
