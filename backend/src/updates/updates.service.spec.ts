import { generateKeyPairSync, sign } from 'crypto';
import { createHash } from 'crypto';
import { UpdatesService } from './updates.service';
import { canonicalRepositoryJson } from './repository-signature';

describe('UpdatesService', () => {
  const pair = generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const originalEnvironment = process.env;
  const prisma = { pluginInstallation: { findMany: jest.fn() } } as any;
  const plugins = { install: jest.fn() } as any;
  let service: UpdatesService;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test', DATABASE_URL: 'postgresql://test/test', APP_VERSION: '1.2.0',
      MARKETPLACE_URL: 'https://marketplace.example.com', UPDATE_CHANNEL: 'stable',
      UPDATE_REPOSITORY_KEY_ID: 'repository-test', UPDATE_REPOSITORY_PUBLIC_KEY: publicKey,
    };
    service = new UpdatesService(prisma, plugins);
  });

  afterAll(() => { process.env = originalEnvironment; });

  function signed(payload: any) {
    return { payload, signature: { algorithm: 'ed25519', keyId: 'repository-test', value: sign(null, Buffer.from(canonicalRepositoryJson(payload)), privateKey).toString('base64') } };
  }

  it('reports compatible plugin updates, local advisories, and active core blockers', async () => {
    prisma.pluginInstallation.findMany.mockResolvedValue([{ id: 'wattanam.announcements', version: '1.0.0', status: 'active', manifestJson: JSON.stringify({ requiresCore: '<2.0.0' }) }]);
    const payload = {
      schemaVersion: 1,
      pluginReleases: [{ pluginId: 'wattanam.announcements', name: 'Announcements', version: '1.1.0', publisher: 'wattanam', requiresCore: '>=1.0.0 <2.0.0', channel: 'stable', paid: false, changelog: 'Fix', sha256: 'a'.repeat(64), sizeBytes: 100 }],
      coreReleases: [{ version: '2.0.0', releaseNotes: 'Major release' }],
      advisories: [{ id: 'WAT-2026-0001', pluginId: 'wattanam.announcements', affectedVersions: '<1.1.0', severity: 'high' }],
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(signed(payload)), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result: any = await service.check();
    expect(result.pluginUpdates[0].release.version).toBe('1.1.0');
    expect(result.advisories[0].id).toBe('WAT-2026-0001');
    expect(result.core.updates[0].blockedByActivePlugins).toEqual(['wattanam.announcements']);
  });

  it('checks the downloaded bytes against signed metadata before local installation', async () => {
    const artifact = Buffer.from('signed-wtp-fixture');
    const sha256 = createHash('sha256').update(artifact).digest('hex');
    const payload = {
      schemaVersion: 1, coreReleases: [], advisories: [],
      pluginReleases: [{ pluginId: 'wattanam.announcements', version: '1.1.0', sha256, downloadUrl: `https://marketplace.example.com/v1/artifacts/${sha256}` }],
    };
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(signed(payload)), { status: 200 }))
      .mockResolvedValueOnce(new Response(artifact, { status: 200, headers: { 'content-length': String(artifact.length) } }));
    plugins.install.mockResolvedValue({ id: 'wattanam.announcements', version: '1.1.0' });
    await expect(service.installPlugin('wattanam.announcements', '1.1.0')).resolves.toMatchObject({ version: '1.1.0' });
    expect(plugins.install).toHaveBeenCalledWith(artifact);
  });

  it('rejects an artifact whose bytes do not match signed metadata', async () => {
    const payload = {
      schemaVersion: 1, coreReleases: [], advisories: [],
      pluginReleases: [{ pluginId: 'wattanam.announcements', version: '1.1.0', sha256: 'a'.repeat(64), downloadUrl: `https://marketplace.example.com/v1/artifacts/${'a'.repeat(64)}` }],
    };
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(signed(payload)), { status: 200 }))
      .mockResolvedValueOnce(new Response('tampered', { status: 200 }));
    await expect(service.installPlugin('wattanam.announcements', '1.1.0')).rejects.toThrow('checksum does not match');
    expect(plugins.install).not.toHaveBeenCalled();
  });
});
