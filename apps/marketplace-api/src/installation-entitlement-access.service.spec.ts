import { generateKeyPairSync, sign } from 'node:crypto';
import { InstallationEntitlementAccessService } from './installation-entitlement-access.service';
import { canonicalJson } from './signing';

const installationId = '00000000-0000-4000-8000-000000000010';
const registrationId = 'registration-row-1';
const pluginId = 'official.attendance';

function keyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function signed(privateKeyPem: string, payload: Record<string, unknown>) {
  return sign(null, Buffer.from(canonicalJson(payload)), privateKeyPem).toString('base64');
}

describe('installation entitlement access', () => {
  const now = new Date('2026-08-28T00:00:00.000Z');
  const ts = String(Math.floor(now.getTime() / 1000));

  function prisma(overrides: Partial<Record<string, any>> = {}) {
    const { publicKey } = keyPair();
    return {
      installationRegistration: {
        findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }),
      },
      installationEntitlement: { findUnique: jest.fn(), findMany: jest.fn() },
      ...overrides,
    } as any;
  }

  it('returns the entitlement when the request is freshly and correctly signed', async () => {
    const { privateKey, publicKey } = keyPair();
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }) } });
    p.installationEntitlement.findUnique.mockResolvedValue({ status: 'ACTIVE', signedToken: { payload: {}, signature: {} } });
    const signature = signed(privateKey, { installationId, pluginId, ts });
    const service = new InstallationEntitlementAccessService(p);
    const result = await service.getOne({ installationId, pluginId, ts, signature }, now);
    expect(result).toMatchObject({ pluginId, status: 'ACTIVE' });
  });

  it('rejects a request signed by a key that is not the active one', async () => {
    const impostor = keyPair();
    const p = prisma();
    const signature = signed(impostor.privateKey, { installationId, pluginId, ts });
    const service = new InstallationEntitlementAccessService(p);
    await expect(service.getOne({ installationId, pluginId, ts, signature }, now)).rejects.toThrow('Signature is invalid');
  });

  it('rejects a stale timestamp outside the freshness window', async () => {
    const { privateKey, publicKey } = keyPair();
    const staleTs = String(Math.floor(now.getTime() / 1000) - 600);
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }) } });
    const signature = signed(privateKey, { installationId, pluginId, ts: staleTs });
    const service = new InstallationEntitlementAccessService(p);
    await expect(service.getOne({ installationId, pluginId, ts: staleTs, signature }, now)).rejects.toThrow('freshness window');
  });

  it('rejects a request for an installation with no active key', async () => {
    const { privateKey } = keyPair();
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [] }) } });
    const signature = signed(privateKey, { installationId, pluginId, ts });
    const service = new InstallationEntitlementAccessService(p);
    await expect(service.getOne({ installationId, pluginId, ts, signature }, now)).rejects.toThrow('not registered');
  });

  it('returns 404 when no entitlement exists for the plugin', async () => {
    const { privateKey, publicKey } = keyPair();
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }) } });
    p.installationEntitlement.findUnique.mockResolvedValue(null);
    const signature = signed(privateKey, { installationId, pluginId, ts });
    const service = new InstallationEntitlementAccessService(p);
    await expect(service.getOne({ installationId, pluginId, ts, signature }, now)).rejects.toThrow('No entitlement exists');
  });

  it('cannot be replayed against a different plugin than the one it was signed for', async () => {
    const { privateKey, publicKey } = keyPair();
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }) } });
    const signature = signed(privateKey, { installationId, pluginId, ts });
    const service = new InstallationEntitlementAccessService(p);
    await expect(service.getOne({ installationId, pluginId: 'official.other-plugin', ts, signature }, now)).rejects.toThrow('Signature is invalid');
  });

  it('lists all entitlements for the installation when signed without a plugin id', async () => {
    const { privateKey, publicKey } = keyPair();
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }) } });
    p.installationEntitlement.findMany.mockResolvedValue([{ pluginId, status: 'ACTIVE', signedToken: {} }]);
    const signature = signed(privateKey, { installationId, ts });
    const service = new InstallationEntitlementAccessService(p);
    const result = await service.getAll({ installationId, ts, signature }, now);
    expect(result.entitlements).toEqual([{ pluginId, status: 'ACTIVE', signedToken: {} }]);
  });

  it('authorizes a paid artifact when the installation signs the exact digest and has update access', async () => {
    const { privateKey, publicKey } = keyPair();
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }) } });
    p.installationEntitlement.findUnique.mockResolvedValue({ status: 'ACTIVE', expiresAt: new Date('2027-01-01Z'), updatesThrough: new Date('2026-12-01Z') });
    const sha256 = 'a'.repeat(64);
    const signature = signed(privateKey, { installationId, sha256, ts });
    await expect(new InstallationEntitlementAccessService(p).authorizeDownload({ installationId, pluginId, sha256, ts, signature }, now)).resolves.toEqual({ registrationId });
  });

  it('cannot replay a paid-artifact signature for another digest', async () => {
    const { privateKey, publicKey } = keyPair();
    const p = prisma({ installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: registrationId, keys: [{ publicKeyPem: publicKey }] }) } });
    const signature = signed(privateKey, { installationId, sha256: 'a'.repeat(64), ts });
    await expect(new InstallationEntitlementAccessService(p).authorizeDownload({ installationId, pluginId, sha256: 'b'.repeat(64), ts, signature }, now)).rejects.toThrow('Signature is invalid');
  });
});
