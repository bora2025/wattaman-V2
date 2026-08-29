const DEVELOPMENT_JWT_SECRET = 'wattanam-development-only-secret-do-not-use-in-production';
const INSECURE_JWT_SECRETS = new Set([
  DEVELOPMENT_JWT_SECRET,
  'change-me-in-production-use-a-strong-random-key',
  'secret',
]);

export type NodeEnvironment = 'development' | 'test' | 'production';
export type ProcessRole = 'combined' | 'api' | 'worker';

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
  appVersion: string;
  gitCommit: string | null;
  cookieSecure: boolean;
  jwtAccessExpiry: string;
  jwtRefreshExpiryDays: number;
  backupDir: string;
  backupRetentionDays: number;
  pluginDir: string;
  pluginDataDir: string;
  pluginSafeMode: boolean;
  pluginMaxPackageBytes: number;
  pluginMaxUnpackedBytes: number;
  pluginStorageMaxFileBytes: number;
  processRole: ProcessRole;
  workerPort: number;
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

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function productionPath(env: NodeJS.ProcessEnv, name: string, fallback: string, nodeEnv: NodeEnvironment): string {
  const value = env[name]?.trim() || fallback;
  if (nodeEnv === 'production' && !value.startsWith('/')) {
    throw new Error(`${name} must be an absolute path in production`);
  }
  return value;
}

function duration(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name]?.trim() || fallback;
  if (!/^\d+(s|m|h|d)$/.test(value)) throw new Error(`${name} must be a duration such as 15m, 2h, or 7d`);
  return value;
}

export function getProcessRole(env: NodeJS.ProcessEnv = process.env): ProcessRole {
  const value = env.PROCESS_ROLE?.trim().toLowerCase() || 'combined';
  if (!['combined', 'api', 'worker'].includes(value)) throw new Error('PROCESS_ROLE must be combined, api, or worker');
  return value as ProcessRole;
}

export function runsBackgroundJobs(env: NodeJS.ProcessEnv = process.env): boolean {
  return getProcessRole(env) !== 'api';
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
    cookieSecure: boolean(env, 'COOKIE_SECURE', nodeEnv === 'production'),
    jwtAccessExpiry: duration(env, 'JWT_ACCESS_EXPIRY', '2h'),
    jwtRefreshExpiryDays: integer(env, 'JWT_REFRESH_EXPIRY', 7, 1, 365),
    backupDir: productionPath(env, 'BACKUP_DIR', nodeEnv === 'production' ? '/data/backups' : './backups', nodeEnv),
    backupRetentionDays: integer(env, 'BACKUP_RETENTION_DAYS', 30, 0, 3650),
    pluginDir: productionPath(env, 'PLUGIN_DIR', nodeEnv === 'production' ? '/data/plugins' : './plugins-installed', nodeEnv),
    pluginDataDir: productionPath(env, 'PLUGIN_DATA_DIR', nodeEnv === 'production' ? '/data/plugin-data' : './plugin-data', nodeEnv),
    pluginSafeMode: boolean(env, 'PLUGIN_SAFE_MODE', false),
    pluginMaxPackageBytes: integer(env, 'PLUGIN_MAX_PACKAGE_BYTES', 50 * 1024 * 1024, 1024, 250 * 1024 * 1024),
    pluginMaxUnpackedBytes: integer(env, 'PLUGIN_MAX_UNPACKED_BYTES', 50 * 1024 * 1024, 1024, 500 * 1024 * 1024),
    pluginStorageMaxFileBytes: integer(env, 'PLUGIN_STORAGE_MAX_FILE_BYTES', 1024 * 1024, 1, 100 * 1024 * 1024),
    processRole: getProcessRole(env),
    workerPort: parsePort(env.WORKER_PORT || '3002'),
  };
}

export function getJwtSecret(): string {
  return resolveJwtSecret(process.env, parseNodeEnvironment(process.env.NODE_ENV));
}
