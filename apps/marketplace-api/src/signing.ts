import { createPublicKey, sign } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function signEnvelope<T>(payload: T, privateKey: string, keyId: string) {
  const bytes = Buffer.from(canonicalJson(payload), 'utf8');
  return {
    payload,
    signature: {
      algorithm: 'ed25519' as const,
      keyId,
      value: sign(null, bytes, privateKey).toString('base64'),
    },
  };
}

export function signEnvelopeWithKeys<T>(payload: T, keys: ReadonlyArray<{ privateKey: string; keyId: string }>) {
  if (keys.length < 1) throw new Error('At least one repository signing key is required');
  const bytes = Buffer.from(canonicalJson(payload), 'utf8');
  const signatures = keys.map((key) => ({
    algorithm: 'ed25519' as const,
    keyId: key.keyId,
    value: sign(null, bytes, key.privateKey).toString('base64'),
  }));
  return { payload, signature: signatures[0], signatures };
}

export function repositoryPublicKey(privateKey: string) {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
}
