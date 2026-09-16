import { createHash } from 'crypto';
import { MarketplaceCommerceService } from './marketplace-commerce.service';
import { recordMarketplaceTrustedKey, trustedPluginKeys } from '../plugins/plugin-config';

jest.mock('../plugins/plugin-config', () => ({
  trustedPluginKeys: jest.fn(),
  recordMarketplaceTrustedKey: jest.fn(),
}));

describe('MarketplaceCommerceService install', () => {
  const originalEnvironment = process.env;
  const trustedPluginKeysMock = trustedPluginKeys as jest.MockedFunction<typeof trustedPluginKeys>;
  const recordMarketplaceTrustedKeyMock = recordMarketplaceTrustedKey as jest.MockedFunction<typeof recordMarketplaceTrustedKey>;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test',
      APP_VERSION: '1.2.0',
      MARKETPLACE_URL: 'https://marketplace.example.com',
      UPDATE_REPOSITORY_KEY_ID: 'repository-test',
      UPDATE_REPOSITORY_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest\n-----END PUBLIC KEY-----',
    };
  });

  afterEach(() => {
    process.env = originalEnvironment;
    jest.restoreAllMocks();
  });

  it('installs a marketplace plugin on clean core without requiring existing plugin rows', async () => {
    const artifact = Buffer.from('clean-core-marketplace-artifact');
    const sha256 = createHash('sha256').update(artifact).digest('hex');
    const prisma = { installation: { findUnique: jest.fn() }, pluginInstallation: { findUnique: jest.fn(), findMany: jest.fn() } } as any;
    const link = { getValidAccessToken: jest.fn().mockResolvedValue('token') } as any;
    const updates = {
      index: jest.fn().mockResolvedValue({
        pluginReleases: [{
          pluginId: 'wattanam.announcements',
          version: '1.1.0',
          publisher: 'partner',
          sha256,
          downloadUrl: `https://marketplace.example.com/v1/artifacts/${sha256}`,
        }],
      }),
    } as any;
    const plugins = { install: jest.fn().mockResolvedValue({ id: 'wattanam.announcements', status: 'installed' }), activate: jest.fn() } as any;
    trustedPluginKeysMock.mockResolvedValue({});
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(artifact, { status: 200, headers: { 'content-length': String(artifact.length) } }) as any);

    const service = new MarketplaceCommerceService(prisma, link, updates, plugins);
    await expect(service.install('wattanam.announcements', '1.1.0', false)).resolves.toMatchObject({ id: 'wattanam.announcements', status: 'installed' });

    expect(plugins.install).toHaveBeenCalledWith(artifact, undefined, {});
    expect(prisma.pluginInstallation.findUnique).not.toHaveBeenCalled();
    expect(prisma.pluginInstallation.findMany).not.toHaveBeenCalled();
    expect(recordMarketplaceTrustedKeyMock).not.toHaveBeenCalled();
  });

  it('merges and persists a release publisher key, then activates when requested', async () => {
    const artifact = Buffer.from('first-party-marketplace-artifact');
    const sha256 = createHash('sha256').update(artifact).digest('hex');
    const publisherKeyId = 'publisher-key-1';
    const publisherPublicKeyPem = '-----BEGIN PUBLIC KEY-----\npublisher\n-----END PUBLIC KEY-----';
    const prisma = {} as any;
    const link = { getValidAccessToken: jest.fn().mockResolvedValue('token') } as any;
    const updates = {
      index: jest.fn().mockResolvedValue({
        pluginReleases: [{
          pluginId: 'wattanam.announcements',
          version: '1.2.0',
          publisher: 'wattanam',
          sha256,
          downloadUrl: `https://marketplace.example.com/v1/artifacts/${sha256}`,
          publisherKeyId,
          publisherPublicKeyPem,
        }],
      }),
    } as any;
    const plugins = {
      install: jest.fn().mockResolvedValue({ id: 'wattanam.announcements', status: 'installed' }),
      activate: jest.fn().mockResolvedValue({ id: 'wattanam.announcements', status: 'active' }),
    } as any;
    trustedPluginKeysMock.mockResolvedValue({
      wattanam: {
        existing: '-----BEGIN PUBLIC KEY-----\nexisting\n-----END PUBLIC KEY-----',
      },
    });
    recordMarketplaceTrustedKeyMock.mockResolvedValue(undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(artifact, { status: 200, headers: { 'content-length': String(artifact.length) } }) as any);

    const service = new MarketplaceCommerceService(prisma, link, updates, plugins);
    await expect(service.install('wattanam.announcements', '1.2.0', true)).resolves.toMatchObject({ id: 'wattanam.announcements', status: 'active' });

    expect(plugins.install).toHaveBeenCalledWith(
      artifact,
      undefined,
      {
        wattanam: {
          existing: '-----BEGIN PUBLIC KEY-----\nexisting\n-----END PUBLIC KEY-----',
          [publisherKeyId]: publisherPublicKeyPem,
        },
      },
    );
    expect(recordMarketplaceTrustedKeyMock).toHaveBeenCalledWith('wattanam', publisherKeyId, publisherPublicKeyPem);
    expect(plugins.activate).toHaveBeenCalledWith('wattanam.announcements');
  });
});
