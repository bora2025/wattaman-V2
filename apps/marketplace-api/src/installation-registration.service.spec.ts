import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { InstallationRegistrationService } from './installation-registration.service';
import { canonicalJson } from './signing';

const installationId = '00000000-0000-4000-8000-000000000010';
const accountId = '00000000-0000-4000-8000-000000000020';

function keyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function fingerprintOf(publicKeyPem: string) {
  return createHash('sha256').update(createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })).digest('hex');
}

function signPayload(privateKeyPem: string, payload: Record<string, unknown>) {
  return sign(null, Buffer.from(canonicalJson(payload)), privateKeyPem).toString('base64');
}

function prismaWith(tx: any) {
  return { $transaction: jest.fn((work: (value: any) => unknown) => work(tx)) } as any;
}

describe('installation registration challenge', () => {
  const now = new Date('2026-08-28T00:00:00.000Z');

  it('issues a register challenge when the installation has no active key', async () => {
    const tx = {
      installationRegistrationKey: { findFirst: jest.fn().mockResolvedValue(null) },
      installationRegistrationChallenge: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'challenge-1', nonce: 'a'.repeat(64), purpose: 'REGISTER', expiresAt: new Date(now.getTime() + 300_000) }) },
    };
    const service = new InstallationRegistrationService(prismaWith(tx), {} as any);
    const result = await service.requestChallenge({ installationId, purpose: 'register' }, now);
    expect(result).toMatchObject({ challengeId: 'challenge-1', purpose: 'register' });
  });

  it('refuses a register challenge when the installation is already registered', async () => {
    const tx = { installationRegistrationKey: { findFirst: jest.fn().mockResolvedValue({ id: 'key-1' }) } };
    const service = new InstallationRegistrationService(prismaWith(tx), {} as any);
    await expect(service.requestChallenge({ installationId, purpose: 'register' }, now)).rejects.toThrow('already registered');
  });

  it('refuses a rotate challenge when the installation is not yet registered', async () => {
    const tx = { installationRegistrationKey: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new InstallationRegistrationService(prismaWith(tx), {} as any);
    await expect(service.requestChallenge({ installationId, purpose: 'rotate' }, now)).rejects.toThrow('not registered');
  });

  it('reuses an unconsumed unexpired challenge instead of minting a new one', async () => {
    const existing = { id: 'challenge-1', nonce: 'b'.repeat(64), purpose: 'REGISTER', expiresAt: new Date(now.getTime() + 60_000) };
    const tx = {
      installationRegistrationKey: { findFirst: jest.fn().mockResolvedValue(null) },
      installationRegistrationChallenge: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn() },
    };
    const service = new InstallationRegistrationService(prismaWith(tx), {} as any);
    const result = await service.requestChallenge({ installationId, purpose: 'register' }, now);
    expect(result.challengeId).toBe('challenge-1');
    expect(tx.installationRegistrationChallenge.create).not.toHaveBeenCalled();
  });
});

describe('installation registration (proof of possession)', () => {
  const now = new Date('2026-08-28T00:00:00.000Z');
  const challengeId = '00000000-0000-4000-8000-000000000030';
  const challenge = { id: challengeId, installationId, nonce: 'c'.repeat(64), purpose: 'REGISTER', consumedAt: null, expiresAt: new Date(now.getTime() + 60_000) };

  function tx(overrides: Partial<Record<string, any>> = {}) {
    return {
      installationRegistrationChallenge: { findUnique: jest.fn().mockResolvedValue(challenge), update: jest.fn().mockResolvedValue({}) },
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: accountId }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'registration-1' }) },
      installationRegistrationKey: { create: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      ...overrides,
    };
  }

  it('registers a new installation when the signature proves possession of the submitted key', async () => {
    const { publicKey, privateKey } = keyPair();
    const signature = signPayload(privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register' });
    const service = new InstallationRegistrationService(prismaWith(tx()), {} as any);
    const result = await service.register({ accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature }, now);
    expect(result).toMatchObject({ installationId, accountId, keyFingerprint: fingerprintOf(publicKey) });
  });

  it('rejects a signature produced by a different key than the one being registered', async () => {
    const submitted = keyPair();
    const other = keyPair();
    const signature = signPayload(other.privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register' });
    const service = new InstallationRegistrationService(prismaWith(tx()), {} as any);
    await expect(service.register({ accountId, installationId, publicKeyPem: submitted.publicKey, challengeId: challenge.id, signature }, now))
      .rejects.toThrow('Signature is invalid');
  });

  it('rejects replay of an already-consumed challenge', async () => {
    const { publicKey, privateKey } = keyPair();
    const signature = signPayload(privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register' });
    const consumed = { ...challenge, consumedAt: now };
    const service = new InstallationRegistrationService(prismaWith(tx({ installationRegistrationChallenge: { findUnique: jest.fn().mockResolvedValue(consumed) } })), {} as any);
    await expect(service.register({ accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature }, now))
      .rejects.toThrow('already been used');
  });

  it('rejects a challenge minted for a different installation (cross-installation claim)', async () => {
    const { publicKey, privateKey } = keyPair();
    const otherInstallationId = '00000000-0000-4000-8000-000000000099';
    const foreignChallenge = { ...challenge, installationId: otherInstallationId };
    const signature = signPayload(privateKey, { installationId: otherInstallationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register' });
    const service = new InstallationRegistrationService(prismaWith(tx({ installationRegistrationChallenge: { findUnique: jest.fn().mockResolvedValue(foreignChallenge) } })), {} as any);
    await expect(service.register({ accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature }, now))
      .rejects.toThrow('does not match this installation');
  });

  it('rejects an expired challenge', async () => {
    const { publicKey, privateKey } = keyPair();
    const expired = { ...challenge, expiresAt: new Date(now.getTime() - 1_000) };
    const signature = signPayload(privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register' });
    const service = new InstallationRegistrationService(prismaWith(tx({ installationRegistrationChallenge: { findUnique: jest.fn().mockResolvedValue(expired) } })), {} as any);
    await expect(service.register({ accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature }, now))
      .rejects.toThrow('expired');
  });

  it('refuses to register an installationId that already has an active key (hijack prevention)', async () => {
    const { publicKey, privateKey } = keyPair();
    const signature = signPayload(privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register' });
    const existingRegistration = { id: 'registration-1', keys: [{ id: 'key-1', keyFingerprint: 'existing' }] };
    const service = new InstallationRegistrationService(prismaWith(tx({ installationRegistration: { findUnique: jest.fn().mockResolvedValue(existingRegistration) } })), {} as any);
    await expect(service.register({ accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature }, now))
      .rejects.toThrow('already registered; rotate');
  });
});

describe('installation key rotation', () => {
  const now = new Date('2026-08-28T00:00:00.000Z');
  const active = keyPair();
  const challenge = { id: '00000000-0000-4000-8000-000000000031', installationId, nonce: 'd'.repeat(64), purpose: 'ROTATE', consumedAt: null, expiresAt: new Date(now.getTime() + 60_000) };
  const activeKeyRow = { id: 'key-1', keyFingerprint: fingerprintOf(active.publicKey), publicKeyPem: active.publicKey };

  function tx(overrides: Partial<Record<string, any>> = {}) {
    return {
      installationRegistrationChallenge: { findUnique: jest.fn().mockResolvedValue(challenge), update: jest.fn().mockResolvedValue({}) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', keys: [activeKeyRow] }), update: jest.fn().mockResolvedValue({}) },
      installationRegistrationKey: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      ...overrides,
    };
  }

  it('rotates when the rotation request is signed by the currently active key', async () => {
    const next = keyPair();
    const newFingerprint = fingerprintOf(next.publicKey);
    const signature = signPayload(active.privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint: newFingerprint });
    const service = new InstallationRegistrationService(prismaWith(tx()), {} as any);
    const result = await service.rotateKey({ installationId, challengeId: challenge.id, signature, newPublicKeyPem: next.publicKey }, now);
    expect(result).toMatchObject({ installationId, keyFingerprint: newFingerprint });
  });

  it('revokes the old key and inserts the new one as active', async () => {
    const next = keyPair();
    const newFingerprint = fingerprintOf(next.publicKey);
    const signature = signPayload(active.privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint: newFingerprint });
    const instance = tx();
    const service = new InstallationRegistrationService(prismaWith(instance), {} as any);
    await service.rotateKey({ installationId, challengeId: challenge.id, signature, newPublicKeyPem: next.publicKey }, now);
    expect(instance.installationRegistrationKey.update).toHaveBeenCalledWith({ where: { id: 'key-1' }, data: { revokedAt: now } });
    expect(instance.installationRegistrationKey.create.mock.calls[0][0].data).toMatchObject({ installationRegistrationId: 'registration-1', keyFingerprint: newFingerprint });
  });

  it('rejects rotation signed by a key other than the currently active one', async () => {
    const next = keyPair();
    const impostor = keyPair();
    const newFingerprint = fingerprintOf(next.publicKey);
    const signature = signPayload(impostor.privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint: newFingerprint });
    const service = new InstallationRegistrationService(prismaWith(tx()), {} as any);
    await expect(service.rotateKey({ installationId, challengeId: challenge.id, signature, newPublicKeyPem: next.publicKey }, now))
      .rejects.toThrow('Signature is invalid');
  });

  it('rejects rotating to the same key that is already active', async () => {
    const newFingerprint = fingerprintOf(active.publicKey);
    const signature = signPayload(active.privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint: newFingerprint });
    const service = new InstallationRegistrationService(prismaWith(tx()), {} as any);
    await expect(service.rotateKey({ installationId, challengeId: challenge.id, signature, newPublicKeyPem: active.publicKey }, now))
      .rejects.toThrow('identical to the current key');
  });

  it('rejects rotation when the installation is not registered', async () => {
    const next = keyPair();
    const signature = signPayload(active.privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint: fingerprintOf(next.publicKey) });
    const service = new InstallationRegistrationService(prismaWith(tx({ installationRegistration: { findUnique: jest.fn().mockResolvedValue(null) } })), {} as any);
    await expect(service.rotateKey({ installationId, challengeId: challenge.id, signature, newPublicKeyPem: next.publicKey }, now))
      .rejects.toThrow('not registered');
  });

  it('rejects reusing a register-purpose challenge for a rotation', async () => {
    const next = keyPair();
    const registerChallenge = { ...challenge, purpose: 'REGISTER' };
    const signature = signPayload(active.privateKey, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint: fingerprintOf(next.publicKey) });
    const service = new InstallationRegistrationService(prismaWith(tx({ installationRegistrationChallenge: { findUnique: jest.fn().mockResolvedValue(registerChallenge) } })), {} as any);
    await expect(service.rotateKey({ installationId, challengeId: challenge.id, signature, newPublicKeyPem: next.publicKey }, now))
      .rejects.toThrow('purpose does not match');
  });
});
