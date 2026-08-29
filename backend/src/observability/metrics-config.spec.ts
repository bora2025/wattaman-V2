import { readMetricsToken } from './metrics-config';

describe('readMetricsToken', () => {
  it('returns null when unset, so /metrics is disabled by default', () => {
    expect(readMetricsToken({})).toBeNull();
  });

  it('rejects a token shorter than 32 characters', () => {
    expect(() => readMetricsToken({ METRICS_TOKEN: 'too-short' })).toThrow('at least 32 characters');
  });

  it('accepts and trims a valid token', () => {
    const token = 'a'.repeat(32);
    expect(readMetricsToken({ METRICS_TOKEN: `  ${token}  ` })).toBe(token);
  });
});
