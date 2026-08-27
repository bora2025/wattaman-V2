const DEVELOPMENT_JWT_SECRET = 'wattanam-development-only-secret-do-not-use-in-production';
const INSECURE_JWT_SECRETS = new Set([
  DEVELOPMENT_JWT_SECRET,
  'change-me-in-production-use-a-strong-random-key',
  'secret',
]);

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
  appVersion: string;
  gitCommit: string | null;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const nodeEnv = value || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  return nodeEnv as NodeEnvironment;
}

function parsePort(value: string | undefined): number {
  const port = Number(value || '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function parseCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  return value.split(',').map((item) => {
    const origin = item.trim();
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error(`CORS_ORIGINS must contain HTTP(S) origins without paths: ${origin}`);
    }
    return origin;
  });
}

export function getCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const nodeEnv = parseNodeEnvironment(env.NODE_ENV);
  const origins = parseCorsOrigins(env.CORS_ORIGINS);
  if (origins.length > 0) return origins;
  if (nodeEnv === 'production') throw new Error('CORS_ORIGINS is required in production');
  return ['http://localhost:3000', 'http://localhost:3004'];
}

function resolveJwtSecret(env: NodeJS.ProcessEnv, nodeEnv: NodeEnvironment): string {
  const secret = env.JWT_SECRET?.trim() || DEVELOPMENT_JWT_SECRET;
  if (nodeEnv === 'production' && (secret.length < 32 || INSECURE_JWT_SECRETS.has(secret))) {
    throw new Error('JWT_SECRET must be a unique production secret of at least 32 characters');
  }
  return secret;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = parseNodeEnvironment(env.NODE_ENV);
  const corsOrigins = getCorsOrigins(env);

  return {
    nodeEnv,
    port: parsePort(env.PORT),
    databaseUrl: required(env, 'DATABASE_URL'),
    jwtSecret: resolveJwtSecret(env, nodeEnv),
    corsOrigins,
    appVersion: env.APP_VERSION?.trim() || '0.1.0-dev',
    gitCommit: env.GIT_COMMIT?.trim() || env.RAILWAY_GIT_COMMIT_SHA?.trim() || null,
  };
}

export function getJwtSecret(): string {
  return resolveJwtSecret(process.env, parseNodeEnvironment(process.env.NODE_ENV));
}
