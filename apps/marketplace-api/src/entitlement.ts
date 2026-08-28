import { randomBytes, randomUUID, sign, verify } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson } from './signing';

const instant = z.string().datetime({ offset: true });

export const entitlementPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  tokenId: z.string().uuid(),
  installationId: z.string().min(1).max(200),
  customerId: z.string().min(1).max(200),
  productId: z.string().min(1).max(200),
  licensedMajorRange: z.string().regex(/^\^(?:0|[1-9]\d*)\.0\.0$/),
  issuedAt: instant,
  notBefore: instant,
  expiresAt: instant,
  updatesThrough: instant,
  offlineRecheckAfter: instant,
  features: z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/)).max(100),
  issuer: z.string().url(),
  audience: z.literal('wattanam-school'),
  keyId: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();

export type EntitlementPayload = z.infer<typeof entitlementPayloadSchema>;

export type SignedEntitlement = {
  payload: EntitlementPayload;
  signature: { algorithm: 'ed25519'; keyId: string; value: string };
};

export function issueEntitlement(
  input: Omit<EntitlementPayload, 'schemaVersion' | 'tokenId' | 'issuedAt' | 'audience' | 'keyId' | 'nonce'>,
  privateKey: string,
  keyId: string,
  now = new Date(),
): SignedEntitlement {
  const payload = entitlementPayloadSchema.parse({
    ...input,
    schemaVersion: 1,
    tokenId: randomUUID(),
    issuedAt: now.toISOString(),
    audience: 'wattanam-school',
    keyId,
    nonce: randomBytes(16).toString('hex'),
  });
  validateWindows(payload);
  return {
    payload,
    signature: {
      algorithm: 'ed25519',
      keyId,
      value: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64'),
    },
  };
}

export function verifyEntitlement(
  token: unknown,
  publicKeys: ReadonlyMap<string, string>,
  expected: { installationId: string; productId: string; now?: Date },
): EntitlementPayload {
  const envelope = z.object({
    payload: entitlementPayloadSchema,
    signature: z.object({
      algorithm: z.literal('ed25519'),
      keyId: z.string(),
      value: z.string().base64(),
    }).strict(),
  }).strict().parse(token);
  if (envelope.signature.keyId !== envelope.payload.keyId) throw new Error('Entitlement key id mismatch');
  const publicKey = publicKeys.get(envelope.payload.keyId);
  if (!publicKey) throw new Error('Entitlement signing key is not trusted');
  const valid = verify(null, Buffer.from(canonicalJson(envelope.payload)), publicKey, Buffer.from(envelope.signature.value, 'base64'));
  if (!valid) throw new Error('Entitlement signature is invalid');
  if (envelope.payload.installationId !== expected.installationId) throw new Error('Entitlement belongs to another installation');
  if (envelope.payload.productId !== expected.productId) throw new Error('Entitlement belongs to another product');
  validateWindows(envelope.payload);
  const now = (expected.now ?? new Date()).getTime();
  if (now < Date.parse(envelope.payload.notBefore)) throw new Error('Entitlement is not active yet');
  if (now > Date.parse(envelope.payload.expiresAt)) throw new Error('Entitlement has expired');
  if (now > Date.parse(envelope.payload.offlineRecheckAfter)) throw new Error('Entitlement requires an online refresh');
  return envelope.payload;
}

function validateWindows(payload: EntitlementPayload) {
  const issued = Date.parse(payload.issuedAt);
  const notBefore = Date.parse(payload.notBefore);
  const expires = Date.parse(payload.expiresAt);
  const updates = Date.parse(payload.updatesThrough);
  const recheck = Date.parse(payload.offlineRecheckAfter);
  if (notBefore < issued || expires <= notBefore) throw new Error('Invalid entitlement validity window');
  if (updates < notBefore || updates > expires) throw new Error('Invalid entitlement update window');
  if (recheck < notBefore || recheck > expires) throw new Error('Invalid entitlement offline window');
}
