import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { z } from 'zod';
import { MarketplaceConfig } from './config';
import { HttpError } from './http-error';
import { canonicalJson } from './signing';

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

const challengeInput = z.object({
  installationId: z.string().uuid(),
  purpose: z.enum(['register', 'rotate']),
}).strict();

const registerInput = z.object({
  accountId: z.string().uuid(),
  installationId: z.string().uuid(),
  label: z.string().trim().min(1).max(120).optional(),
  publicKeyPem: z.string().includes('PUBLIC KEY'),
  challengeId: z.string().uuid(),
  signature: z.string().base64(),
}).strict();

const rotateInput = z.object({
  installationId: z.string().uuid(),
  challengeId: z.string().uuid(),
  signature: z.string().base64(),
  newPublicKeyPem: z.string().includes('PUBLIC KEY'),
}).strict();

export class InstallationRegistrationService {
  constructor(private readonly prisma: PrismaClient, private readonly config: MarketplaceConfig) {}

  async requestChallenge(value: unknown, now = new Date()) {
    const input = challengeInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const activeKey = await tx.installationRegistrationKey.findFirst({
        where: { revokedAt: null, installation: { installationId: input.installationId } },
      });
      if (input.purpose === 'rotate' && !activeKey) throw new HttpError(404, 'Installation is not registered; request a register challenge instead');
      if (input.purpose === 'register' && activeKey) throw new HttpError(409, 'Installation is already registered; request a rotate challenge instead');

      const reusable = await tx.installationRegistrationChallenge.findFirst({
        where: { installationId: input.installationId, purpose: input.purpose.toUpperCase() as 'REGISTER' | 'ROTATE', consumedAt: null, expiresAt: { gt: now } },
      });
      if (reusable) return this.publicChallenge(reusable);

      const created = await tx.installationRegistrationChallenge.create({
        data: {
          installationId: input.installationId,
          purpose: input.purpose.toUpperCase() as 'REGISTER' | 'ROTATE',
          nonce: randomBytes(32).toString('hex'),
          expiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS),
        },
      });
      return this.publicChallenge(created);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async register(value: unknown, now = new Date()) {
    const input = registerInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const challenge = await this.consumeChallenge(tx, { challengeId: input.challengeId, installationId: input.installationId, purpose: 'REGISTER', now });
      const account = await tx.marketplaceAccount.findUnique({ where: { id: input.accountId }, select: { id: true } });
      if (!account) throw new HttpError(404, 'Account not found');

      const existing = await tx.installationRegistration.findUnique({
        where: { installationId: input.installationId },
        include: { keys: { where: { revokedAt: null } } },
      });
      if (existing && existing.keys.length > 0) throw new HttpError(409, 'Installation is already registered; rotate its key instead');

      const fingerprint = this.fingerprintOf(input.publicKeyPem);
      this.verifySignature(input.publicKeyPem, {
        installationId: input.installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'register',
      }, input.signature);

      const registration = existing
        ? await tx.installationRegistration.update({ where: { id: existing.id }, data: { accountId: input.accountId, label: input.label } })
        : await tx.installationRegistration.create({ data: { installationId: input.installationId, accountId: input.accountId, label: input.label } });

      try {
        await tx.installationRegistrationKey.create({ data: { installationRegistrationId: registration.id, keyFingerprint: fingerprint, publicKeyPem: input.publicKeyPem } });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, 'This public key is already registered for this installation');
        throw error;
      }
      await this.audit(tx, { action: 'installation_registered', success: true, metadata: { installationId: input.installationId, accountId: input.accountId, keyFingerprint: fingerprint } });
      return { installationId: input.installationId, accountId: input.accountId, keyFingerprint: fingerprint, registeredAt: now };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async rotateKey(value: unknown, now = new Date()) {
    const input = rotateInput.parse(value);
    return this.prisma.$transaction(async (tx) => {
      const challenge = await this.consumeChallenge(tx, { challengeId: input.challengeId, installationId: input.installationId, purpose: 'ROTATE', now });
      const registration = await tx.installationRegistration.findUnique({
        where: { installationId: input.installationId },
        include: { keys: { where: { revokedAt: null } } },
      });
      const activeKey = registration?.keys[0];
      if (!registration || !activeKey) throw new HttpError(404, 'Installation is not registered');

      const newFingerprint = this.fingerprintOf(input.newPublicKeyPem);
      if (newFingerprint === activeKey.keyFingerprint) throw new HttpError(409, 'New key is identical to the current key');

      this.verifySignature(activeKey.publicKeyPem, {
        installationId: input.installationId, challengeId: challenge.id, nonce: challenge.nonce, purpose: 'rotate', newKeyFingerprint: newFingerprint,
      }, input.signature);

      await tx.installationRegistrationKey.update({ where: { id: activeKey.id }, data: { revokedAt: now } });
      try {
        await tx.installationRegistrationKey.create({ data: { installationRegistrationId: registration.id, keyFingerprint: newFingerprint, publicKeyPem: input.newPublicKeyPem } });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, 'This public key has already been used for this installation');
        throw error;
      }
      await tx.installationRegistration.update({ where: { id: registration.id }, data: { lastSeenAt: now } });
      await this.audit(tx, { action: 'installation_key_rotated', success: true, metadata: { installationId: input.installationId, keyFingerprint: newFingerprint } });
      return { installationId: input.installationId, keyFingerprint: newFingerprint, rotatedAt: now };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async consumeChallenge(tx: Prisma.TransactionClient, input: { challengeId: string; installationId: string; purpose: 'REGISTER' | 'ROTATE'; now: Date }) {
    const challenge = await tx.installationRegistrationChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge) throw new HttpError(400, 'Challenge not found');
    if (challenge.installationId !== input.installationId) throw new HttpError(400, 'Challenge does not match this installation');
    if (challenge.purpose !== input.purpose) throw new HttpError(400, 'Challenge purpose does not match this request');
    if (challenge.consumedAt) throw new HttpError(400, 'Challenge has already been used');
    if (challenge.expiresAt <= input.now) throw new HttpError(400, 'Challenge has expired');
    await tx.installationRegistrationChallenge.update({ where: { id: challenge.id }, data: { consumedAt: input.now } });
    return challenge;
  }

  private verifySignature(signingPublicKeyPem: string, payload: Record<string, unknown>, signatureBase64: string) {
    const bytes = Buffer.from(canonicalJson(payload));
    let valid: boolean;
    try {
      valid = verify(null, bytes, signingPublicKeyPem, Buffer.from(signatureBase64, 'base64'));
    } catch {
      throw new HttpError(400, 'Signature could not be verified');
    }
    if (!valid) throw new HttpError(400, 'Signature is invalid');
  }

  private fingerprintOf(publicKeyPem: string): string {
    try {
      const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
      return createHash('sha256').update(der).digest('hex');
    } catch {
      throw new HttpError(400, 'publicKeyPem is not a valid public key');
    }
  }

  private publicChallenge(challenge: { id: string; nonce: string; purpose: string; expiresAt: Date }) {
    return { challengeId: challenge.id, nonce: challenge.nonce, purpose: challenge.purpose.toLowerCase(), expiresAt: challenge.expiresAt };
  }

  private async audit(tx: Prisma.TransactionClient, entry: { action: string; success: boolean; metadata?: Prisma.InputJsonValue }) {
    await tx.marketplaceAuditEvent.create({ data: entry });
  }
}
