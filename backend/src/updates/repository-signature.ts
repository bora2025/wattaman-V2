import { verify } from 'crypto';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

export function canonicalRepositoryJson(value: unknown) {
  return JSON.stringify(normalize(value));
}

export function verifyRepositoryEnvelope(value: unknown, publicKey: string, expectedKeyId: string): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Repository response is not an envelope');
  const envelope = value as Record<string, any>;
  if (!envelope.payload || !envelope.signature || envelope.signature.algorithm !== 'ed25519' || envelope.signature.keyId !== expectedKeyId) {
    throw new Error('Repository signature metadata is invalid');
  }
  let valid = false;
  try {
    valid = verify(null, Buffer.from(canonicalRepositoryJson(envelope.payload)), publicKey, Buffer.from(envelope.signature.value, 'base64'));
  } catch { valid = false; }
  if (!valid) throw new Error('Repository metadata signature is invalid');
  if (envelope.payload.schemaVersion !== 1 || !Array.isArray(envelope.payload.pluginReleases) || !Array.isArray(envelope.payload.coreReleases) || !Array.isArray(envelope.payload.advisories)) {
    throw new Error('Repository metadata schema is unsupported');
  }
  return envelope.payload;
}
