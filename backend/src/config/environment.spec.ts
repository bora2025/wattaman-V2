import { parseCorsOrigins, readRuntimeConfig } from './environment';

describe('runtime environment', () => {
  const baseEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost:5432/wattanam_test',
  };

  it('loads safe development defaults', () => {
    const config = readRuntimeConfig(baseEnvironment);

    expect(config.port).toBe(3001);
    expect(config.nodeEnv).toBe('test');
    expect(config.databaseUrl).toBe(baseEnvironment.DATABASE_URL);
    expect(config.cookieSecure).toBe(false);
    expect(config.backupRetentionDays).toBe(30);
    expect(config.pluginMaxPackageBytes).toBe(50 * 1024 * 1024);
  });

  it('rejects an insecure production JWT secret', () => {
    expect(() => readRuntimeConfig({
      ...baseEnvironment,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://school.example.com',
      JWT_SECRET: 'secret',
    })).toThrow('JWT_SECRET');
  });

  it('requires explicit production CORS origins', () => {
    expect(() => readRuntimeConfig({
      ...baseEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'a-unique-production-secret-with-more-than-32-characters',
    })).toThrow('CORS_ORIGINS');
  });

  it('parses exact HTTP origins', () => {
    expect(parseCorsOrigins('https://school.example.com,http://localhost:3000')).toEqual([
      'https://school.example.com',
      'http://localhost:3000',
    ]);
  });

  it('rejects origins containing paths', () => {
    expect(() => parseCorsOrigins('https://school.example.com/admin')).toThrow('without paths');
  });

  it('rejects malformed boolean and bounded integer settings', () => {
    expect(() => readRuntimeConfig({ ...baseEnvironment, PLUGIN_SAFE_MODE: 'yes' })).toThrow('PLUGIN_SAFE_MODE');
    expect(() => readRuntimeConfig({ ...baseEnvironment, BACKUP_RETENTION_DAYS: '-1' })).toThrow('BACKUP_RETENTION_DAYS');
    expect(() => readRuntimeConfig({ ...baseEnvironment, PLUGIN_MAX_PACKAGE_BYTES: '999999999' })).toThrow('PLUGIN_MAX_PACKAGE_BYTES');
  });

  it('requires persistent production paths to be absolute', () => {
    expect(() => readRuntimeConfig({
      ...baseEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'a-unique-production-secret-with-more-than-32-characters',
      CORS_ORIGINS: 'https://school.example.com',
      BACKUP_DIR: './backups',
    })).toThrow('BACKUP_DIR');
  });

  it('validates authentication expiry formats', () => {
    expect(() => readRuntimeConfig({ ...baseEnvironment, JWT_ACCESS_EXPIRY: 'two hours' })).toThrow('JWT_ACCESS_EXPIRY');
    expect(() => readRuntimeConfig({ ...baseEnvironment, JWT_REFRESH_EXPIRY: '0' })).toThrow('JWT_REFRESH_EXPIRY');
  });
});
