import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { MetricsRegistry } from './metrics';
import { logEvent } from './structured-logger';

export function requestLoggingMiddleware(metrics: MetricsRegistry) {
  return (request: Request, response: Response, next: NextFunction) => {
    const correlationId = request.header('x-request-id') || randomUUID();
    response.setHeader('x-request-id', correlationId);
    metrics.incInFlight();
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      metrics.decInFlight();
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const route = (request.route?.path as string | undefined) ?? (response.statusCode === 404 ? 'not_found' : request.path);
      metrics.observeHttpRequest(request.method, route, response.statusCode, durationSeconds);

      const accountId = (request as Request & { accountId?: string }).accountId;
      logEvent(response.statusCode >= 500 ? 'error' : 'info', {
        correlationId,
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs: Math.round(durationSeconds * 1000),
        actorId: accountId ?? null,
        releaseVersion: process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || process.env.npm_package_version || 'unknown',
        action: `${request.method} ${route}`,
        outcome: response.statusCode < 400 ? 'success' : 'failure',
      });
    });

    next();
  };
}
