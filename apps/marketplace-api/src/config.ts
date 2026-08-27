import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  DATABASE_URL: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url().refine((value) => !value.endsWith('/'), 'must not end with /'),
  MARKETPLACE_ADMIN_TOKEN: z.string().min(32),
  METADATA_SIGNING_PRIVATE_KEY_FILE: z.string().min(1).optional(),
  METADATA_SIGNING_PRIVATE_KEY: z.string().min(1).optional(),
  METADATA_SIGNING_KEY_ID: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  ARTIFACT_STORAGE_PATH: z.string().min(1),
  MAX_ARTIFACT_BYTES: z.coerce.number().int().positive().max(250 * 1024 * 1024).default(50 * 1024 * 1024),
});

export type MarketplaceConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  publicBaseUrl: string;
  adminToken: string;
  signingPrivateKey: string;
  signingKeyId: string;
  artifactPath: string;
  maxArtifactBytes: number;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): MarketplaceConfig {
  const value = schema.parse(env);
  const artifactPath = path.resolve(value.ARTIFACT_STORAGE_PATH);
  mkdirSync(artifactPath, { recursive: true });
  const signingPrivateKey = value.METADATA_SIGNING_PRIVATE_KEY_FILE && existsSync(path.resolve(value.METADATA_SIGNING_PRIVATE_KEY_FILE))
    ? readFileSync(path.resolve(value.METADATA_SIGNING_PRIVATE_KEY_FILE), 'utf8')
    : value.METADATA_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!signingPrivateKey) throw new Error('METADATA_SIGNING_PRIVATE_KEY_FILE or METADATA_SIGNING_PRIVATE_KEY is required');
  if (!signingPrivateKey.includes('PRIVATE KEY')) throw new Error('Repository signing key is not a PEM private key');
  if (value.NODE_ENV === 'production' && !value.PUBLIC_BASE_URL.startsWith('https://')) {
    throw new Error('PUBLIC_BASE_URL must use HTTPS in production');
  }
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    publicBaseUrl: value.PUBLIC_BASE_URL,
    adminToken: value.MARKETPLACE_ADMIN_TOKEN,
    signingPrivateKey,
    signingKeyId: value.METADATA_SIGNING_KEY_ID,
    artifactPath,
    maxArtifactBytes: value.MAX_ARTIFACT_BYTES,
  };
}
