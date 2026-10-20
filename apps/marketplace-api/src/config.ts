import { createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { parseSecretEncryptionKeys, SecretEncryptionKey } from './secret-encryption';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  DATABASE_URL: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url().refine((value) => !value.endsWith('/'), 'must not end with /'),
  MARKETPLACE_ADMIN_TOKEN: z.string().min(32),
  MARKETPLACE_SECONDARY_ADMIN_TOKENS_JSON: z.string().optional(),
  METADATA_SIGNING_PRIVATE_KEY_FILE: z.string().min(1).optional(),
  METADATA_SIGNING_PRIVATE_KEY: z.string().min(1).optional(),
  METADATA_SIGNING_PROVIDER: z.enum(['local', 'remote']).default('local'),
  METADATA_SIGNING_KEY_ID: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  METADATA_SECONDARY_SIGNING_KEYS_JSON: z.string().optional(),
  METADATA_SECONDARY_SIGNING_KEYS_BASE64: z.string().optional(),
  METADATA_SIGNING_PUBLIC_KEYS_JSON: z.string().optional(),
  METADATA_SIGNING_ENDPOINT: z.string().url().optional(),
  METADATA_SIGNING_BEARER_TOKEN: z.string().min(32).optional(),
  METADATA_SIGNING_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5_000),
  ENTITLEMENT_SIGNING_PRIVATE_KEY_FILE: z.string().min(1).optional(),
  ENTITLEMENT_SIGNING_PRIVATE_KEY: z.string().min(1).optional(),
  ENTITLEMENT_SIGNING_KEY_ID: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32),
  PAYMENT_WEBHOOK_SECONDARY_SECRETS_JSON: z.string().optional(),
  ARTIFACT_STORAGE_PATH: z.string().min(1),
  ARTIFACT_STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  ARTIFACT_S3_BUCKET: z.string().min(1).optional(), ARTIFACT_S3_REGION: z.string().min(1).optional(), ARTIFACT_S3_ENDPOINT: z.string().url().optional(),
  ARTIFACT_S3_ACCESS_KEY_ID: z.string().min(1).optional(), ARTIFACT_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(), ARTIFACT_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  MAX_ARTIFACT_BYTES: z.coerce.number().int().positive().max(250 * 1024 * 1024).default(50 * 1024 * 1024),
  IDENTITY_ENCRYPTION_KEYS_JSON: z.string().optional(),
  IDENTITY_ENCRYPTION_ACTIVE_KEY_ID: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/).optional(),
  TRANSACTIONAL_EMAIL_PROVIDER: z.enum(['disabled', 'sendgrid']).default('disabled'),
  ALLOW_MFA_ONLY_PRODUCTION: z.enum(['true', 'false']).default('false'),
  SENDGRID_API_KEY: z.string().min(20).optional(),
  TRANSACTIONAL_EMAIL_FROM: z.string().email().optional(),
});

export type MarketplaceConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  publicBaseUrl: string;
  /** Every currently-valid admin bearer token -- the active one plus any still-trusted retiring
   * ones from MARKETPLACE_SECONDARY_ADMIN_TOKENS_JSON, so rotating doesn't instantly 401 every
   * caller (CI secrets, operator .env files, scripts) the moment the new value goes live. */
  adminTokens: string[];
  signingProvider: 'local' | 'remote';
  signingPrivateKey?: string;
  signingKeyId: string;
  signingKeys: Array<{ privateKey: string; keyId: string }>;
  signingPublicKeys: Array<{ publicKeyPem: string; keyId: string }>;
  remoteSigning?: { endpoint: string; bearerToken: string; timeoutMs: number };
  entitlementPrivateKey: string;
  entitlementKeyId: string;
  /** Every currently-valid webhook signing secret -- the active one plus any still-trusted
   * retiring ones from PAYMENT_WEBHOOK_SECONDARY_SECRETS_JSON. Real overlap value here depends
   * on whatever rotation model the eventual real payment provider's dashboard supports (this
   * adapter, online-hmac-v1, is a deliberate placeholder per ADR-0007) -- but accepting several
   * trusted secrets app-side costs nothing and is ready whenever that provider is chosen. */
  paymentWebhookSecrets: string[];
  artifactPath: string;
  artifactProvider?: 'local' | 's3';
  artifactS3?: { bucket: string; region: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle: boolean };
  maxArtifactBytes: number;
  identityEncryptionKeys: SecretEncryptionKey[];
  transactionalEmail: { provider: 'disabled' | 'sendgrid'; apiKey?: string; from?: string };
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): MarketplaceConfig {
  const value = schema.parse(env);
  const identityEncryptionKeys = parseSecretEncryptionKeys(value.IDENTITY_ENCRYPTION_KEYS_JSON, value.IDENTITY_ENCRYPTION_ACTIVE_KEY_ID);
  if (value.NODE_ENV === 'production' && identityEncryptionKeys.length === 0) {
    throw new Error('IDENTITY_ENCRYPTION_KEYS_JSON is required in production');
  }
  if (value.TRANSACTIONAL_EMAIL_PROVIDER === 'sendgrid' && (!value.SENDGRID_API_KEY || !value.TRANSACTIONAL_EMAIL_FROM)) {
    throw new Error('SENDGRID_API_KEY and TRANSACTIONAL_EMAIL_FROM are required for SendGrid transactional email');
  }
  if (value.NODE_ENV === 'production' && value.TRANSACTIONAL_EMAIL_PROVIDER === 'disabled' && value.ALLOW_MFA_ONLY_PRODUCTION !== 'true') {
    throw new Error('TRANSACTIONAL_EMAIL_PROVIDER must be configured in production unless ALLOW_MFA_ONLY_PRODUCTION=true is explicitly accepted');
  }
  const artifactPath = path.resolve(value.ARTIFACT_STORAGE_PATH);
  mkdirSync(artifactPath, { recursive: true });
  if (value.ARTIFACT_STORAGE_PROVIDER === 's3' && (!value.ARTIFACT_S3_BUCKET || !value.ARTIFACT_S3_REGION)) throw new Error('ARTIFACT_S3_BUCKET and ARTIFACT_S3_REGION are required for S3 artifact storage');
  if (!!value.ARTIFACT_S3_ACCESS_KEY_ID !== !!value.ARTIFACT_S3_SECRET_ACCESS_KEY) throw new Error('Both S3 access key variables must be configured together');
  const signingPrivateKey = readPrivateKey(value.METADATA_SIGNING_PRIVATE_KEY_FILE, value.METADATA_SIGNING_PRIVATE_KEY);
  if (value.METADATA_SIGNING_PROVIDER === 'local' && !signingPrivateKey) throw new Error('METADATA_SIGNING_PRIVATE_KEY_FILE or METADATA_SIGNING_PRIVATE_KEY is required for local signing');
  const entitlementPrivateKey = readPrivateKey(value.ENTITLEMENT_SIGNING_PRIVATE_KEY_FILE, value.ENTITLEMENT_SIGNING_PRIVATE_KEY);
  if (!entitlementPrivateKey) throw new Error('ENTITLEMENT_SIGNING_PRIVATE_KEY_FILE or ENTITLEMENT_SIGNING_PRIVATE_KEY is required');
  if (signingPrivateKey && publicKey(signingPrivateKey) === publicKey(entitlementPrivateKey)) throw new Error('Repository and entitlement signing keys must be distinct');
  if (value.METADATA_SIGNING_KEY_ID === value.ENTITLEMENT_SIGNING_KEY_ID) throw new Error('Repository and entitlement key IDs must be distinct');
  if (value.METADATA_SECONDARY_SIGNING_KEYS_JSON && value.METADATA_SECONDARY_SIGNING_KEYS_BASE64) throw new Error('Configure only one secondary repository key transport');
  const secondaryJson = value.METADATA_SECONDARY_SIGNING_KEYS_BASE64
    ? Buffer.from(value.METADATA_SECONDARY_SIGNING_KEYS_BASE64, 'base64').toString('utf8')
    : value.METADATA_SECONDARY_SIGNING_KEYS_JSON;
  const secondaryKeys = parseSecondaryKeys(secondaryJson);
  const signingKeys = signingPrivateKey ? [{ privateKey: signingPrivateKey, keyId: value.METADATA_SIGNING_KEY_ID }, ...secondaryKeys] : [];
  const remotePublicKeys = parsePublicKeys(value.METADATA_SIGNING_PUBLIC_KEYS_JSON);
  if (value.METADATA_SIGNING_PROVIDER === 'remote') {
    if (!value.METADATA_SIGNING_ENDPOINT || !value.METADATA_SIGNING_BEARER_TOKEN) throw new Error('Remote signing requires METADATA_SIGNING_ENDPOINT and METADATA_SIGNING_BEARER_TOKEN');
    if (value.NODE_ENV === 'production' && !value.METADATA_SIGNING_ENDPOINT.startsWith('https://')) throw new Error('METADATA_SIGNING_ENDPOINT must use HTTPS in production');
    if (!remotePublicKeys.some((key) => key.keyId === value.METADATA_SIGNING_KEY_ID)) throw new Error('Remote signing public keys must include METADATA_SIGNING_KEY_ID');
  }
  if (new Set(signingKeys.map((key) => key.keyId)).size !== signingKeys.length) throw new Error('Repository signing key IDs must be unique');
  const signingPublicKeys = value.METADATA_SIGNING_PROVIDER === 'remote'
    ? remotePublicKeys
    : signingKeys.map((key) => ({ keyId: key.keyId, publicKeyPem: publicKey(key.privateKey) }));
  if (new Set(signingPublicKeys.map((key) => key.keyId)).size !== signingPublicKeys.length) throw new Error('Repository signing key IDs must be unique');
  const publicKeys = signingPublicKeys.map((key) => key.publicKeyPem);
  if (new Set(publicKeys).size !== publicKeys.length) throw new Error('Repository signing keys must be distinct');
  if (publicKeys.includes(publicKey(entitlementPrivateKey))) throw new Error('Repository and entitlement signing keys must be distinct');
  if (value.NODE_ENV === 'production' && !value.PUBLIC_BASE_URL.startsWith('https://')) {
    throw new Error('PUBLIC_BASE_URL must use HTTPS in production');
  }
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    publicBaseUrl: value.PUBLIC_BASE_URL,
    adminTokens: [normalizeBearerSecret(value.MARKETPLACE_ADMIN_TOKEN), ...parseSecondaryTokens(value.MARKETPLACE_SECONDARY_ADMIN_TOKENS_JSON, 'MARKETPLACE_SECONDARY_ADMIN_TOKENS_JSON').map(normalizeBearerSecret)],
    signingProvider: value.METADATA_SIGNING_PROVIDER,
    signingPrivateKey,
    signingKeyId: value.METADATA_SIGNING_KEY_ID,
    signingKeys,
    signingPublicKeys,
    remoteSigning: value.METADATA_SIGNING_PROVIDER === 'remote' ? { endpoint: value.METADATA_SIGNING_ENDPOINT!, bearerToken: value.METADATA_SIGNING_BEARER_TOKEN!, timeoutMs: value.METADATA_SIGNING_TIMEOUT_MS } : undefined,
    entitlementPrivateKey,
    entitlementKeyId: value.ENTITLEMENT_SIGNING_KEY_ID,
    paymentWebhookSecrets: [value.PAYMENT_WEBHOOK_SECRET, ...parseSecondaryTokens(value.PAYMENT_WEBHOOK_SECONDARY_SECRETS_JSON, 'PAYMENT_WEBHOOK_SECONDARY_SECRETS_JSON')],
    artifactPath,
    artifactProvider: value.ARTIFACT_STORAGE_PROVIDER,
    artifactS3: value.ARTIFACT_STORAGE_PROVIDER === 's3' ? { bucket: value.ARTIFACT_S3_BUCKET!, region: value.ARTIFACT_S3_REGION!, endpoint: value.ARTIFACT_S3_ENDPOINT, accessKeyId: value.ARTIFACT_S3_ACCESS_KEY_ID, secretAccessKey: value.ARTIFACT_S3_SECRET_ACCESS_KEY, forcePathStyle: value.ARTIFACT_S3_FORCE_PATH_STYLE === 'true' } : undefined,
    maxArtifactBytes: value.MAX_ARTIFACT_BYTES,
    identityEncryptionKeys,
    transactionalEmail: { provider: value.TRANSACTIONAL_EMAIL_PROVIDER, apiKey: value.SENDGRID_API_KEY, from: value.TRANSACTIONAL_EMAIL_FROM },
  };
}

/** BOMs can be introduced by Windows-written environment files. They cannot be represented in an
 * HTTP Authorization ByteString, so retaining one would make an otherwise correct token unusable. */
function normalizeBearerSecret(value: string): string {
  return value.replace(/\uFEFF/g, '').trim();
}

/** Shared shape for a "still-trusted retiring bearer tokens" rotation list -- no key id needed
 * (unlike signing keys), since a bearer token is checked by membership, not by picking one). */
export function parseSecondaryTokens(raw: string | undefined, envVarName: string): string[] {
  if (!raw?.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`${envVarName} must be valid JSON`); }
  return z.array(z.string().min(32)).parse(value);
}

function parseSecondaryKeys(raw: string | undefined) {
  if (!raw?.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('METADATA_SECONDARY_SIGNING_KEYS_JSON must be valid JSON'); }
  const parsed = z.record(z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/), z.string().min(1)).parse(value);
  return Object.entries(parsed).map(([keyId, privateKey]) => ({ keyId, privateKey: privateKey.replace(/\\n/g, '\n') }));
}

function parsePublicKeys(raw: string | undefined) {
  if (!raw?.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('METADATA_SIGNING_PUBLIC_KEYS_JSON must be valid JSON'); }
  const parsed = z.record(z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/), z.string().min(1)).parse(value);
  return Object.entries(parsed).map(([keyId, publicKeyPem]) => {
    const normalized = publicKeyPem.replace(/\\n/g, '\n');
    if (!normalized.includes('PUBLIC KEY')) throw new Error('Remote signing public keys must be PEM public keys');
    return { keyId, publicKeyPem: normalized };
  });
}

function readPrivateKey(file: string | undefined, inline: string | undefined) {
  const result = file && existsSync(path.resolve(file)) ? readFileSync(path.resolve(file), 'utf8') : inline?.replace(/\\n/g, '\n');
  if (result && !result.includes('PRIVATE KEY')) throw new Error('Signing key is not a PEM private key');
  return result;
}

function publicKey(privateKey: string) {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
}
