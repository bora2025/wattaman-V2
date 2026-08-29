/**
 * Deliberately independent of environment.ts's readRuntimeConfig(), matching the existing
 * precedent of marketplace-identity-config.ts / entitlement-config.ts: a scraper (Prometheus)
 * cannot do interactive JWT login, so /metrics needs its own static-bearer-token gate, the
 * same shape as apps/marketplace-api's admin token guard.
 */
export function readMetricsToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.METRICS_TOKEN?.trim();
  if (!token) return null;
  if (token.length < 32) throw new Error('METRICS_TOKEN must be at least 32 characters');
  return token;
}
