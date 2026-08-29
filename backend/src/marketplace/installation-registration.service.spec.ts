import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { InstallationKeyService } from './installation-key.service';
import { InstallationRegistrationService } from './installation-registration.service';

describe('InstallationRegistrationService', () => {
  const originalEnvironment = process.env;
  let keyDir: string;
  let prisma: any;
  let keys: InstallationKeyService;
  let service: InstallationRegistrationService;

  beforeEach(() => {
    keyDir = mkdtempSync(path.join(os.tmpdir(), 'wattanam-installation-registration-'));
    process.env = { ...originalEnvironment, MARKETPLACE_URL: 'https://marketplace.example.com', INSTALLATION_KEY_DIR: keyDir };
    prisma = { installation: { findUnique: jest.fn().mockResolvedValue({ installationId: 'school-public-id' }) } };
    keys = new InstallationKeyService();
    service = new InstallationRegistrationService(prisma, keys);
  });

  afterEach(() => { rmSync(keyDir, { recursive: true, force: true }); jest.restoreAllMocks(); });
  afterAll(() => { process.env = originalEnvironment; });

  it('rejects any action before first-run installation has created the singleton row', async () => {
    prisma.installation.findUnique.mockResolvedValue(null);
    await expect(service.register('account-1')).rejects.toThrow('first-run installation');
  });

  it('requests a challenge, signs it, and submits registration', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: 'challenge-1', nonce: 'n'.repeat(64), purpose: 'register', expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ installationId: 'school-public-id', accountId: 'account-1', keyFingerprint: 'fp' }), { status: 201 }));
    const result = await service.register('account-1', 'Main Campus');
    expect(result).toMatchObject({ accountId: 'account-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const registerCall = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(registerCall).toMatchObject({ accountId: 'account-1', installationId: 'school-public-id', label: 'Main Campus' });
    expect(registerCall.signature).toEqual(expect.any(String));
  });

  it('surfaces the marketplace error message when registration is rejected', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: 'challenge-1', nonce: 'n'.repeat(64), purpose: 'register', expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Installation is already registered; rotate its key instead' }), { status: 409 }));
    await expect(service.register('account-1')).rejects.toThrow('already registered');
  });

  it('treats a marketplace network failure as unavailable rather than crashing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(service.register('account-1')).rejects.toThrow('unavailable');
  });

  it('only persists the newly generated key locally after the marketplace confirms rotation', async () => {
    const before = await keys.ensureKeyPair();
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: 'challenge-2', nonce: 'n'.repeat(64), purpose: 'rotate', expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Signature is invalid' }), { status: 400 }));
    await expect(service.rotateKey()).rejects.toThrow('Signature is invalid');
    const stillCurrent = await new InstallationKeyService().ensureKeyPair();
    expect(stillCurrent.fingerprint).toBe(before.fingerprint);
  });

  it('rotates the local key only after the marketplace accepts the new public key', async () => {
    const before = await keys.ensureKeyPair();
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: 'challenge-3', nonce: 'n'.repeat(64), purpose: 'rotate', expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ installationId: 'school-public-id', keyFingerprint: 'server-reported-fp' }), { status: 200 }));
    await service.rotateKey();
    const rotated = await new InstallationKeyService().ensureKeyPair();
    expect(rotated.fingerprint).not.toBe(before.fingerprint);
  });

  it('reports local key status without requiring the marketplace to be reachable', async () => {
    await keys.ensureKeyPair();
    const status = await service.status();
    expect(status).toMatchObject({ installationId: 'school-public-id', hasLocalKey: true });
  });
});
