import { existsSync, readFileSync } from 'fs';
import path from 'path';

export interface UpdateRepositoryConfig {
  url: string;
  publicKey: string;
  keyId: string;
  channel: 'stable' | 'beta';
  maximumArtifactBytes: number;
}

export function readUpdateRepositoryConfig(env: NodeJS.ProcessEnv = process.env): UpdateRepositoryConfig | null {
  const rawUrl = env.MARKETPLACE_URL?.trim();
  if (!rawUrl) return null;
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MARKETPLACE_URL must be an HTTP(S) origin without a path');
  }
  if ((env.NODE_ENV || 'development') === 'production' && url.protocol !== 'https:') {
    throw new Error('MARKETPLACE_URL must use HTTPS in production');
  }
  const keyFile = env.UPDATE_REPOSITORY_PUBLIC_KEY_FILE?.trim();
  const inlineKey = env.UPDATE_REPOSITORY_PUBLIC_KEY?.replace(/\\n/g, '\n').trim();
  const resolvedKeyFile = keyFile ? path.resolve(keyFile) : null;
  const publicKey = resolvedKeyFile && existsSync(resolvedKeyFile) ? readFileSync(resolvedKeyFile, 'utf8') : inlineKey;
  if (!publicKey?.includes('PUBLIC KEY')) throw new Error('A pinned update repository public key is required when MARKETPLACE_URL is configured');
  const keyId = env.UPDATE_REPOSITORY_KEY_ID?.trim();
  if (!keyId || !/^[a-zA-Z0-9._-]{1,100}$/.test(keyId)) throw new Error('UPDATE_REPOSITORY_KEY_ID is required and invalid');
  const channel = env.UPDATE_CHANNEL?.trim().toLowerCase() || 'stable';
  if (!['stable', 'beta'].includes(channel)) throw new Error('UPDATE_CHANNEL must be stable or beta');
  const maximumArtifactBytes = Number(env.UPDATE_MAX_ARTIFACT_BYTES || 50 * 1024 * 1024);
  if (!Number.isInteger(maximumArtifactBytes) || maximumArtifactBytes < 1 || maximumArtifactBytes > 250 * 1024 * 1024) {
    throw new Error('UPDATE_MAX_ARTIFACT_BYTES must be between 1 and 262144000');
  }
  return { url: url.origin, publicKey, keyId, channel: channel as 'stable' | 'beta', maximumArtifactBytes };
}
