import { randomUUID } from 'node:crypto';
import { Request } from 'express';

/** Everything an audit row needs about *how* a request arrived, kept in one place so every
 * platform route records the same shape (plan §5.9). */
export interface PlatformActionContext {
  correlationId: string;
  ip?: string;
  userAgent?: string;
}

/**
 * A correlation id links one operator action in the browser to its audit row and server logs.
 * The platform-admin app sends one per action; anything reaching the API without one (a script,
 * a direct call) still gets a generated id rather than a null, so no audit row is ever
 * uncorrelated.
 */
export function actionContext(request: Request): PlatformActionContext {
  const header = request.header('x-correlation-id');
  const correlationId = header && /^[A-Za-z0-9._:-]{8,128}$/.test(header) ? header : randomUUID();
  const forwarded = request.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' && forwarded.length > 0
    ? forwarded.split(',')[0].trim()
    : request.ip;
  return { correlationId, ip, userAgent: request.header('user-agent')?.slice(0, 500) };
}
