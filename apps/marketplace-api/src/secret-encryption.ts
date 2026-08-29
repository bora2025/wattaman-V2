import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1';

export type SecretEncryptionKey = { keyId: string; key: Buffer };

export function encryptSecret(value: string, keys: SecretEncryptionKey[]): string {
  const active = keys[0];
  if (!active) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', active.key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, active.keyId, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join(':');
}

export function decryptSecret(value: string, keys: SecretEncryptionKey[]): { plaintext: string; needsRotation: boolean } {
  if (!value.startsWith(`${PREFIX}:`)) return { plaintext: value, needsRotation: keys.length > 0 };
  const parts = value.split(':');
  if (parts.length !== 6) throw new Error('Encrypted secret envelope is malformed');
  const [kind, version, keyId, ivRaw, ciphertextRaw, tagRaw] = parts;
  if (`${kind}:${version}` !== PREFIX) throw new Error('Encrypted secret version is unsupported');
  const selected = keys.find((entry) => entry.keyId === keyId);
  if (!selected) throw new Error(`Encrypted secret key ${keyId} is not configured`);
  try {
    const decipher = createDecipheriv('aes-256-gcm', selected.key, Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
    return { plaintext, needsRotation: keys[0]?.keyId !== keyId };
  } catch {
    throw new Error('Encrypted secret authentication failed');
  }
}

export function parseSecretEncryptionKeys(raw: string | undefined, activeKeyId: string | undefined): SecretEncryptionKey[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('IDENTITY_ENCRYPTION_KEYS_JSON must be valid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('IDENTITY_ENCRYPTION_KEYS_JSON must be an object');
  if (!activeKeyId) throw new Error('IDENTITY_ENCRYPTION_ACTIVE_KEY_ID is required when identity encryption keys are configured');
  const entries = Object.entries(parsed as Record<string, unknown>).map(([keyId, encoded]) => {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(keyId) || typeof encoded !== 'string') throw new Error('Identity encryption keyring contains an invalid entry');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error(`Identity encryption key ${keyId} must be exactly 32 bytes encoded as canonical base64`);
    return { keyId, key };
  });
  const active = entries.find((entry) => entry.keyId === activeKeyId);
  if (!active) throw new Error('IDENTITY_ENCRYPTION_ACTIVE_KEY_ID is not present in the keyring');
  return [active, ...entries.filter((entry) => entry !== active)];
}
