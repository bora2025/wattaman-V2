const SENSITIVE_KEYS = new Set([
  'password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken', 'sessiontoken',
  'secret', 'mfasecret', 'authorization', 'cookie', 'signature', 'privatekey',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key, SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(child),
    ]));
  }
  return value;
}

export interface StructuredLogFields {
  [key: string]: unknown;
}

/** One JSON line per event on stdout -- no request/record bodies, only explicit fields, redacted defensively. */
export function logEvent(level: 'info' | 'warn' | 'error', fields: StructuredLogFields): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...(redact(fields) as Record<string, unknown>) });
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}
