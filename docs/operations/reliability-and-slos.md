# Reliability, Observability, and SLOs

Implements `docs/platform-master-execution-plan.md` §13.2. Covers structured logging,
metrics, and alerting for both `backend` and `apps/marketplace-api`.

## Structured logging

Every request emits exactly one JSON line on stdout (or stderr for 5xx) via
`src/observability/structured-logger.ts` in each app: `timestamp`, `level`, `correlationId`,
`method`, `route`, `statusCode`, `durationMs`, `actorId`, `actorRole` (backend) or `actorId`
only (marketplace, since sessions aren't role-based), `pluginId` (backend, when the route is
under `/plugin-api/:pluginId`), `releaseVersion`, `action`, `outcome`. Known-sensitive keys
(`password`, `token`, `secret`, `signature`, etc., case-insensitive, anywhere in the object,
including nested) are redacted to `[REDACTED]` before the line is ever built — this is a
request/event log for operators, not the record bodies themselves, which are never logged.

The correlation ID comes from an inbound `x-request-id` header if present, otherwise a fresh
UUID; it's echoed back on the response header either way, so a caller (or another service in
a call chain) can propagate the same ID end to end. `src/observability/request-context.ts`
also exposes it via `AsyncLocalStorage` (`getCorrelationId()`) for any future code that wants
it without being threaded through every function signature.

This is a separate, narrower mechanism from `AuditService`'s append-only DB trail (which
covers authenticated mutations only, for compliance/history) and from ADR-0008's proposed
opt-in fleet telemetry (which phones home a handful of installation-level facts to the
marketplace, gated on DEC-012, and never Tier 2/3 data). Neither structured request logs nor
metrics here are ever sent anywhere outside the installation's own process.

## Metrics

Both apps expose `GET /metrics` in Prometheus text format, gated by a bearer token
(`METRICS_TOKEN`, independent of every other credential — a scraper can't do interactive JWT
login, and shouldn't need the same token that gates admin/publisher actions). The endpoint is
disabled by default (401) until `METRICS_TOKEN` is set. Both apps also emit the standard
Node.js process metrics (CPU, memory, event loop lag, GC) via `prom-client`'s
`collectDefaultMetrics()`.

| Plan §13.2 category | Metric(s) | App |
|---|---|---|
| Latency/error/saturation | `http_request_duration_seconds` (histogram), `http_requests_total`, `http_requests_in_flight` | both |
| DB pool | `db_up` (real `SELECT 1` per scrape) | both |
| Jobs | `plugin_job_last_run_success`, `plugin_job_last_completed_age_seconds` | backend |
| Backup age | `backup_age_seconds` (`+Inf` if no backup exists yet — never a bare `0`, which would misread as "just backed up"), `backup_count` | backend |
| Migration state | `db_migrations_pending` | backend |
| Plugin failures | `plugin_job_last_run_success`, `plugin_entitlement_consecutive_failures` | backend |
| Repository signing/publication | `marketplace_plugin_versions{review_status}` | marketplace |
| Webhook lag/deduplication | `payment_webhook_backlog`, `payment_webhook_processing_lag_seconds` | marketplace |
| Entitlement refresh | `plugin_entitlement_active`, `plugin_entitlement_consecutive_failures` | backend |

All of the database-backed gauges are computed fresh on every scrape by querying the tables
that already hold this state (`PluginJobDefinition`, `PluginEntitlementCache`,
`PaymentWebhookEvent`, `PluginVersion`, `_prisma_migrations`) rather than pushed incrementally
from the services that write those tables — this keeps them correct across restarts and meant
`plugin-jobs.service.ts` / `entitlement-cache.service.ts` / `payment-webhook.service.ts` /
`repository.service.ts` needed no code changes at all.

**Honest gap**: "DB pool" in the plan's sense (active vs. idle connections, pool
exhaustion) isn't exposed here — Prisma's query engine manages its own connection pool
internally and doesn't surface pool-level metrics through the Node client today. `db_up` is a
real, useful liveness signal, not a pool-saturation one; closing that gap would mean adopting
Prisma's driver-adapter mode with a `pg.Pool` the app controls directly, which is a larger,
separate change.

**Deduplication**: enforced structurally by `PaymentWebhookEvent`'s
`@@unique([provider, eventId])` constraint (a rejected duplicate never reaches a second
`create`, so it can't be re-counted at scrape time); `payment_webhook_backlog` and
`_processing_lag_seconds` cover the "lag" half of that plan line directly.

## Alerts

`docs/operations/alerting-rules.yml` is a real, `promtool check rules`-validated Prometheus
rule file (`SUCCESS: 14 rules found`) — 14 alerts across both services, each with `severity`,
`owner`, `response_target`, and `runbook` annotations:

| Alert | Severity | Owner | Response target |
|---|---|---|---|
| BackendDown / MarketplaceDown | critical | SRE / Marketplace on-call | 15 min |
| BackendDatabaseDown / MarketplaceDatabaseDown | critical | SRE / Marketplace on-call | 15 min |
| BackendBackupTooOld | critical | SRE on-call | 4 h (matches the backup RTO target) |
| BackendNoBackupEverTaken | critical | SRE on-call | 4 h |
| BackendHighErrorRate / MarketplaceHighErrorRate | warning | SRE / Marketplace on-call | 1 h |
| BackendHighLatencyP95 | warning | SRE on-call | 1 h |
| BackendPendingMigrations | warning | SRE on-call | 4 h |
| BackendPluginJobFailing | warning | Plugin support | 1 business day |
| BackendEntitlementRefreshFailing | warning | Marketplace on-call | 4 h |
| MarketplacePaymentWebhookBacklog / …HighLag | warning | Marketplace on-call | 1 h |

Every `runbook` annotation points at an existing operations doc — no alert references a
procedure that doesn't exist yet.

## SLO targets (plan §13.2)

- School API: 99.9% monthly availability. `BackendHighErrorRate`'s 1% threshold is a warning
  well ahead of that budget being exhausted, not the SLO breach itself (a full SLO-burn-rate
  alert needs a longer observation window than this pass implements; noted as a follow-up).
- Marketplace: 99.9% monthly availability, same treatment via `MarketplaceHighErrorRate`.
- Backup RPO 24h / RTO 4h: `BackendBackupTooOld` fires at 26h (2h grace past one missed
  nightly run) with a 4h response target matching the RTO figure directly.

These are the plan's stated *initial* targets, not independently re-derived here; they
should be revisited once real production traffic exists to base an SLO on.

## Verification

- Unit tests: `structured-logger.spec.ts` (redaction, level routing) and
  `metrics-config.spec.ts` (token validation) in both apps.
- Live: both apps were booted against a real disposable PostgreSQL 16 with a real
  `METRICS_TOKEN`. Confirmed: `/metrics` returns 401 with no/wrong token and 200 with the
  correct one; the response carries a real `x-request-id` correlation header; stdout carries
  one structured JSON line per request with the correlation ID; `db_up`, `db_migrations_pending`,
  `release_version_info`, and the HTTP histogram/counter/gauge all reflect real values.
  `backup_age_seconds` was confirmed to read `+Inf` with no backup manifest present, then a
  real number once a real manifest file existed. `plugin_job_last_run_success`/
  `plugin_job_last_completed_age_seconds` and `plugin_entitlement_consecutive_failures`/
  `plugin_entitlement_active` were confirmed against real rows inserted into
  `PluginJobDefinition`/`PluginEntitlementCache`.
- `docs/operations/alerting-rules.yml` was validated with `promtool check rules` (bundled in
  the official `prom/prometheus` image) — `SUCCESS: 14 rules found`, confirming every
  expression parses and every rule is syntactically valid.
- End-to-end alert firing was also live-verified, not just syntax-checked: a real Prometheus
  instance (Docker) was pointed at a real running `backend` instance with these exact rules
  loaded; Prometheus confirmed the scrape target healthy (`/api/v1/targets`); the backend
  process was then stopped; after the rule's `for: 2m` window elapsed, `BackendDown`
  transitioned to `state: "firing"` in Prometheus's own `/api/v1/rules` — confirmed by polling
  that API directly, not inferred. This is the one alert exercised this way so far (it needed
  only stopping the process); the others (backup-age, migration-pending, webhook-backlog,
  entitlement-failure) still rely on the same evaluation engine but haven't each been
  individually fired end-to-end.
- No Grafana/dashboard layer exists yet; `/metrics` and the rule file are the complete
  observable surface today.

## What this does not close

- No Prometheus/Alertmanager instance is actually deployed anywhere (local or production) —
  this delivers the instrumented services and a validated rule file a real deployment can load,
  not a running monitoring stack. Provisioning one is B-005–008-adjacent infrastructure work.
- SLO burn-rate alerting (multi-window, multi-burn-rate per Google SRE practice) is not
  implemented — the simple threshold alerts above are a reasonable first pass, not the final
  word.
- A recurring "test schedule" for these alerts (the plan's own phrase) doesn't exist yet
  beyond today's one-time validation and live `BackendDown` firing drill; pairing it with the
  existing quarterly backup-restore drill cadence (B-008) once that's built is the natural
  next step, and the other 13 rules still need their own individual live-fire confirmation.
