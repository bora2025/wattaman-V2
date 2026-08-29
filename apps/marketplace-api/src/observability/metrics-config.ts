/** A Prometheus scraper cannot present the admin bearer token interactively, and shouldn't
 * need the same powerful credential that gates publisher/revenue admin actions, so /metrics
 * gets its own narrower static token, read independently of readConfig() (same precedent as
 * IDENTITY_ENCRYPTION_KEYS_JSON being optional and validated separately). */
export function readMetricsToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.METRICS_TOKEN?.trim();
  if (!token) return null;
  if (token.length < 32) throw new Error('METRICS_TOKEN must be at least 32 characters');
  return token;
}
