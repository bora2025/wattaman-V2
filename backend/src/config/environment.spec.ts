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
});

