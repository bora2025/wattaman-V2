import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { InstallationRegistrationService } from './installation-registration.service';
import { hashToken } from './identity-crypto';
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
      // Prisma returns the whole row from create/update, and the service now reports the account it
      // actually stored rather than the one that was requested -- so the double must carry it too.
      installationRegistration: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'registration-1', accountId }) },
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

describe('installation registration with a school enrollment token', () => {
  const now = new Date('2026-09-03T00:00:00.000Z');
  const challengeId = '00000000-0000-4000-8000-000000000030';
  const challenge = { id: challengeId, installationId, nonce: 'd'.repeat(64), purpose: 'REGISTER', consumedAt: null, expiresAt: new Date(now.getTime() + 60_000) };
  const token = `wtn_enr_${'e'.repeat(64)}`;

  function tx(overrides: Partial<Record<string, any>> = {}) {
    return {
      installationRegistrationChallenge: { findUnique: jest.fn().mockResolvedValue(challenge), update: jest.fn().mockResolvedValue({}) },
      marketplaceAccount: { findUnique: jest.fn().mockResolvedValue({ id: accountId, email: 'owner@example.com' }) },
      installationRegistration: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'registration-1', accountId }), update: jest.fn().mockResolvedValue({}) },
      installationRegistrationKey: { create: jest.fn().mockResolvedValue({}) },
      installationMarketplaceGrant: { upsert: jest.fn().mockResolvedValue({ id: 'grant-1', expiresAt: new Date(now.getTime() + 7_776_000_000) }) },
      installationMarketplaceGrantRequest: { create: jest.fn().mockResolvedValue({ id: 'request-1' }) },
      marketplaceSession: { create: jest.fn().mockResolvedValue({}) },
      marketplaceAuditEvent: { create: jest.fn().mockResolvedValue({}) },
      schoolEnrollmentToken: {
        findUnique: jest.fn().mockResolvedValue({ id: 'token-1', customerSchoolId: 'school-1', consumedAt: null, revokedAt: null, expiresAt: new Date(now.getTime() + 86_400_000) }),
        update: jest.fn().mockResolvedValue({}),
      },
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Angkor High School', slug: 'angkor-high', status: 'AWAITING_CLAIM', installation: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    };
  }

  function validSignature(privateKeyPem: string) {
    return signPayload(privateKeyPem, { installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register' });
  }

  it('binds the installation to the customer school the token was minted for', async () => {
    const { publicKey, privateKey } = keyPair();
    const state = tx();
    const service = new InstallationRegistrationService(prismaWith(state), {} as any);

    const result = await service.register({
      accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature: validSignature(privateKey), enrollmentToken: token,
    }, now);

    expect(result).toMatchObject({ school: { id: 'school-1', slug: 'angkor-high' } });
    expect(state.schoolEnrollmentToken.findUnique.mock.calls[0][0].where.tokenHash).toBe(hashToken(token));
    expect(state.schoolEnrollmentToken.update.mock.calls[0][0].data).toEqual({ consumedAt: now, consumedByInstallationId: installationId });
    expect(state.installationRegistration.update.mock.calls[0][0].data).toEqual({ customerSchoolId: 'school-1' });
    expect(state.customerSchool.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' });
    expect(result).toHaveProperty('autoLink.sessionToken');
  });

  it('registers without a token exactly as before, touching no directory record', async () => {
    const { publicKey, privateKey } = keyPair();
    const state = tx();
    const service = new InstallationRegistrationService(prismaWith(state), {} as any);

    const result = await service.register({ accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature: validSignature(privateKey) }, now);

    expect(result).not.toHaveProperty('school');
    expect(state.schoolEnrollmentToken.findUnique).not.toHaveBeenCalled();
    expect(state.customerSchool.update).not.toHaveBeenCalled();
  });

  // One message for every rejection: a caller probing tokens must not be able to tell an expired
  // one from a revoked one from a value that was never real.
  it.each([
    ['unknown', { schoolEnrollmentToken: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } }],
    ['already consumed', { schoolEnrollmentToken: { findUnique: jest.fn().mockResolvedValue({ id: 'token-1', customerSchoolId: 'school-1', consumedAt: now, revokedAt: null, expiresAt: new Date(now.getTime() + 86_400_000) }), update: jest.fn() } }],
    ['revoked', { schoolEnrollmentToken: { findUnique: jest.fn().mockResolvedValue({ id: 'token-1', customerSchoolId: 'school-1', consumedAt: null, revokedAt: now, expiresAt: new Date(now.getTime() + 86_400_000) }), update: jest.fn() } }],
    ['expired', { schoolEnrollmentToken: { findUnique: jest.fn().mockResolvedValue({ id: 'token-1', customerSchoolId: 'school-1', consumedAt: null, revokedAt: null, expiresAt: new Date(now.getTime() - 1_000) }), update: jest.fn() } }],
  ])('refuses an %s token with an indistinguishable message', async (_label, override) => {
    const { publicKey, privateKey } = keyPair();
    const service = new InstallationRegistrationService(prismaWith(tx(override)), {} as any);

    await expect(service.register({
      accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature: validSignature(privateKey), enrollmentToken: token,
    }, now)).rejects.toThrow('Enrollment token is not valid');
  });

  it('registers on the token alone when no account id is supplied', async () => {
    const { publicKey, privateKey } = keyPair();
    const state = tx({ installationRegistration: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'registration-1', accountId: null }), update: jest.fn().mockResolvedValue({}) } });
    const service = new InstallationRegistrationService(prismaWith(state), {} as any);

    const result = await service.register({
      installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature: validSignature(privateKey), enrollmentToken: token,
    }, now);

    expect(result.accountId).toBeNull();
    expect(state.marketplaceAccount.findUnique).not.toHaveBeenCalled();
    expect(state.installationRegistration.create.mock.calls[0][0].data.accountId).toBeNull();
    expect(result).toMatchObject({ school: { slug: 'angkor-high' } });
  });

  it('refuses a registration carrying neither an account nor a token', async () => {
    const { publicKey, privateKey } = keyPair();
    const service = new InstallationRegistrationService(prismaWith(tx()), {} as any);
    await expect(service.register({
      installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature: validSignature(privateKey),
    }, now)).rejects.toThrow();
  });

  it('does not clear an existing account id when re-registering without one', async () => {
    const { publicKey, privateKey } = keyPair();
    const state = tx({
      installationRegistration: {
        findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', accountId: accountId, keys: [] }),
        create: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'registration-1', accountId }),
      },
    });
    const service = new InstallationRegistrationService(prismaWith(state), {} as any);

    await service.register({
      installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature: validSignature(privateKey), enrollmentToken: token,
    }, now);

    // Re-registering a school that lost its key is a key operation, not a change of owner.
    expect(state.installationRegistration.update.mock.calls[0][0].data).not.toHaveProperty('accountId');
  });

  it('refuses a token whose school has been suspended', async () => {
    const { publicKey, privateKey } = keyPair();
    const state = tx({ customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'SUSPENDED', installation: null }), update: jest.fn() } });
    const service = new InstallationRegistrationService(prismaWith(state), {} as any);

    await expect(service.register({
      accountId, installationId, publicKeyPem: publicKey, challengeId: challenge.id, signature: validSignature(privateKey), enrollmentToken: token,
    }, now)).rejects.toThrow('Enrollment token is not valid');
    expect(state.schoolEnrollmentToken.update).not.toHaveBeenCalled();
  });

  it('does not burn the token when the signature fails to verify', async () => {
    const submitted = keyPair();
    const other = keyPair();
    const state = tx();
    const service = new InstallationRegistrationService(prismaWith(state), {} as any);

    await expect(service.register({
      accountId, installationId, publicKeyPem: submitted.publicKey, challengeId: challenge.id,
      signature: validSignature(other.privateKey), enrollmentToken: token,
    }, now)).rejects.toThrow('Signature is invalid');
    expect(state.schoolEnrollmentToken.findUnique).not.toHaveBeenCalled();
    expect(state.schoolEnrollmentToken.update).not.toHaveBeenCalled();
  });
});
