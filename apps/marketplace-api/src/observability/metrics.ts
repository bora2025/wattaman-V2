import { PrismaClient } from '@prisma/client';
import * as client from 'prom-client';

/**
 * Every domain gauge here is read fresh from the database on every scrape rather than
 * pushed incrementally from commerce.service.ts / payment-webhook.service.ts / repository.service.ts,
 * so it stays accurate across restarts without those files needing any changes.
 */
export function createMetricsRegistry(prisma: PrismaClient) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds', help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'], buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [registry],
  });
  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });
  const httpRequestsInFlight = new client.Gauge({
    name: 'http_requests_in_flight', help: 'HTTP requests currently being handled (saturation proxy)',
    registers: [registry],
  });

  new client.Gauge({
    name: 'release_version_info', help: 'Always 1; the app_version label identifies the running release',
    labelNames: ['app_version'], registers: [registry],
  }).set({
    app_version: process.env.RAILWAY_GIT_COMMIT_SHA?.trim()
      || process.env.RELEASE_VERSION?.trim()
      || process.env.APP_VERSION?.trim()
      || process.env.npm_package_version
      || 'unknown',
  }, 1);

  new client.Gauge({
    name: 'db_up', help: '1 if a database round trip on this scrape succeeded, 0 otherwise', registers: [registry],
    async collect() {
      try { await prisma.$queryRawUnsafe('SELECT 1'); this.set(1); } catch { this.set(0); }
    },
  });

  new client.Gauge({
    name: 'payment_webhook_backlog', help: 'Webhook events received more than 5 minutes ago and still unprocessed',
    registers: [registry],
    async collect() {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ backlog: bigint }>>(
          `SELECT COUNT(*)::bigint AS backlog FROM "PaymentWebhookEvent" WHERE "processedAt" IS NULL AND "receivedAt" < NOW() - INTERVAL '5 minutes'`,
        );
        this.set(Number(rows[0]?.backlog ?? 0));
      } catch { /* table may not exist against a not-yet-migrated database; leave unset rather than fail the scrape */ }
    },
  });

  new client.Gauge({
    name: 'payment_webhook_processing_lag_seconds', help: 'Average processing lag of webhook events received in the last hour',
    registers: [registry],
    async collect() {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ lag: number | null }>>(
          `SELECT AVG(EXTRACT(EPOCH FROM ("processedAt" - "receivedAt")))::float AS lag FROM "PaymentWebhookEvent" WHERE "processedAt" IS NOT NULL AND "receivedAt" > NOW() - INTERVAL '1 hour'`,
        );
        if (rows[0]?.lag != null) this.set(rows[0].lag);
      } catch { /* see above */ }
    },
  });

  new client.Gauge({
    name: 'marketplace_plugin_versions', help: 'Plugin versions by review status',
    labelNames: ['review_status'], registers: [registry],
    async collect() {
      this.reset();
      try {
        const rows = await prisma.pluginVersion.groupBy({ by: ['reviewStatus'], _count: { _all: true } });
        for (const row of rows) this.set({ review_status: row.reviewStatus }, row._count._all);
      } catch { /* see above */ }
    },
  });

  new client.Gauge({
    name: 'marketplace_entitlements_active', help: 'Installation entitlements currently ACTIVE', registers: [registry],
    async collect() {
      try { this.set(await prisma.installationEntitlement.count({ where: { status: 'ACTIVE' } })); } catch { /* see above */ }
    },
  });

  return {
    registry,
    observeHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
      const labels = { method, route, status_code: String(statusCode) };
      httpRequestDuration.observe(labels, durationSeconds);
      httpRequestsTotal.inc(labels);
    },
    incInFlight() { httpRequestsInFlight.inc(); },
    decInFlight() { httpRequestsInFlight.dec(); },
  };
}

export type MetricsRegistry = ReturnType<typeof createMetricsRegistry>;
