import { RepositoryService } from './repository.service';

function serviceWith(tx: any) {
  const prisma = { $transaction: jest.fn((work: (client: any) => unknown) => work(tx)) } as any;
  return new RepositoryService(prisma, {} as any);
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
});
