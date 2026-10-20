import { RepositoryService } from './repository.service';
import { generateKeyPairSync } from 'node:crypto';

function serviceWith(tx: any) {
  const prisma = { $transaction: jest.fn((work: (client: any) => unknown) => work(tx)) } as any;
  return new RepositoryService(prisma, {} as any);
}

function repositoryConfig() {
  const privateKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { publicBaseUrl: 'https://marketplace.example', signingKeyId: 'repository-1', signingKeys: [{ keyId: 'repository-1', privateKey }] } as any;
}

describe('repository channel promotion', () => {
  it('promotes a beta plugin by moving the existing artifact row without rebuilding bytes', async () => {
    const beta = { id: 'version-1', pluginId: 'wattanam.announcements', version: '1.1.0', reviewStatus: 'APPROVED', withdrawnAt: null, artifact: { sha256: 'a'.repeat(64) } };
    const tx = { pluginVersion: {
      findUnique: jest.fn().mockResolvedValueOnce(beta).mockResolvedValueOnce(null),
      update: jest.fn().mockResolvedValue({ ...beta, channel: 'STABLE' }),
    } };
    await expect(serviceWith(tx).promotePluginRelease({ pluginId: beta.pluginId, version: beta.version })).resolves.toEqual({
      pluginId: beta.pluginId, version: beta.version, channel: 'STABLE', sha256: beta.artifact.sha256, rebuilt: false,
    });
    expect(tx.pluginVersion.update).toHaveBeenCalledWith({ where: { id: beta.id }, data: { channel: 'STABLE' }, include: { artifact: true } });
  });

  it('promotes core metadata without changing immutable image digests', async () => {
    const beta = {
      id: 'core-1', version: '1.2.0', channel: 'BETA', withdrawnAt: null,
      apiImage: `api@sha256:${'a'.repeat(64)}`, webImage: `web@sha256:${'b'.repeat(64)}`, gatewayImage: `gateway@sha256:${'c'.repeat(64)}`,
    };
    const tx = { coreRelease: {
      findUnique: jest.fn().mockResolvedValueOnce(beta).mockResolvedValueOnce(null),
      update: jest.fn().mockResolvedValue({ ...beta, channel: 'STABLE' }),
    } };
    const result = await serviceWith(tx).promoteCoreRelease({ version: beta.version });
    expect(result).toMatchObject({ version: beta.version, channel: 'STABLE', rebuilt: false, images: { api: beta.apiImage, web: beta.webImage, gateway: beta.gatewayImage } });
  });

  it('withdraws a release, publishes an emergency action, and records a review atomically', async () => {
    const release = { id: 'version-1', pluginId: 'vulnerable.plugin', version: '1.0.0', withdrawnAt: null };
    const tx = {
      pluginVersion: { findUnique: jest.fn().mockResolvedValue(release), update: jest.fn().mockResolvedValue({}) },
      securityAdvisory: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
      versionReview: { create: jest.fn().mockResolvedValue({}) },
    };
    const result: any = await serviceWith(tx).withdrawPluginRelease({
      id: 'WAT-2026-9999', pluginId: release.pluginId, version: release.version, channel: 'STABLE', reason: 'Confirmed compromise',
      title: 'Compromised release', severity: 'CRITICAL', affectedVersions: '=1.0.0', description: 'Deactivate immediately',
      recommendedAction: 'DISABLE', communicationUrl: 'https://status.wattanam.example/incidents/9999',
    });
    expect(result.advisory).toMatchObject({ id: 'WAT-2026-9999', recommendedAction: 'DISABLE' });
    expect(tx.pluginVersion.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewStatus: 'WITHDRAWN' }) }));
    expect(tx.versionReview.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewer: 'security-incident' }) }));
  });

  it('publishes only channel-allowed plugin releases compatible with the requesting core', async () => {
    const publisher = { slug: 'wattanam', keys: [{ keyId: 'publisher-key-1', publicKeyPem: 'test-public-key' }] };
    const plugin = { name: 'Example', description: 'Example', isPaid: false, status: 'APPROVED', publisher };
    const version = (id: string, value: string, requiresCore: string, channel: 'STABLE' | 'BETA') => ({
      id, pluginId: id, version: value, requiresCore, channel, reviewStatus: 'APPROVED', withdrawnAt: null,
      manifestJson: {}, changelog: null, artifact: { sha256: id.padEnd(64, 'a').slice(0, 64), sizeBytes: 10, publisherKeyId: 'publisher-key-1' }, plugin,
    });
    const prisma = {
      pluginVersion: { findMany: jest.fn().mockResolvedValue([
        version('compatible', '1.1.0', '>=1.0.0 <2.0.0', 'STABLE'),
        version('future-core', '2.0.0', '>=2.0.0', 'STABLE'),
      ]) },
      coreRelease: { findMany: jest.fn().mockResolvedValue([]) },
      securityAdvisory: { findMany: jest.fn().mockResolvedValue([]) },
      publisherKey: { findMany: jest.fn().mockResolvedValue([{ keyId: 'retired-2025', publisher: { slug: 'wattanam' } }]) },
    } as any;
    const result: any = await new RepositoryService(prisma, repositoryConfig()).signedIndex('1.5.0', 'stable');
    expect(result.payload.pluginReleases.map((release: any) => release.pluginId)).toEqual(['compatible']);
    expect(prisma.pluginVersion.findMany.mock.calls[0][0].where.channel.in).toEqual(['STABLE']);
    expect(result.signatures).toHaveLength(1);
    expect(result.payload.revokedPublisherKeys).toEqual(['wattanam:retired-2025']);
  });
});
