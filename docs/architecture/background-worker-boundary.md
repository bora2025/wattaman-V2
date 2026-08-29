# Background Worker Process Boundary

## Roles

`PROCESS_ROLE` is validated at startup and defaults to `combined` for backward compatibility.

| Role | HTTP API | Nest cron jobs | Plugin interval jobs | Intended use |
|---|---:|---:|---:|---|
| `combined` | yes | yes | yes | Default for small schools |
| `api` | yes | no | no | API side of a split deployment |
| `worker` | no | yes | yes | Worker side of a split deployment |

The API entrypoint refuses `PROCESS_ROLE=worker`; the worker entrypoint refuses every other role. This prevents a configuration typo from silently exposing an HTTP API in the worker or running background jobs in an API-only process.

## Scheduled work inventory

- Audit-retention cleanup (`AuditService`)
- Daily and weekly notification digests (`DigestService`)
- Six-hourly marketplace entitlement refresh (`EntitlementCacheService`)
- Plugin-defined interval jobs (`PluginJobsService`)

`ScheduleModule.forRoot()` exists exactly once at the application root. Its cron/interval/timeout discovery is disabled for the `api` role. Plugin definitions are still persisted in an API process, but timers are created only in `combined` or `worker` roles.

Plugin jobs also take `pg_try_advisory_xact_lock(hashtext(pluginId), hashtext(jobId))` for their entire execution. A second worker skips the run when it cannot acquire the lock, while different plugin/job pairs remain independent. The in-process running set prevents re-entry before PostgreSQL is consulted.

## Health and shutdown

`dist/worker` exposes only:

- `GET :3002/health/live`
- `GET :3002/health/ready`, which executes `SELECT 1`

On `SIGTERM`/`SIGINT`, it stops accepting health requests, closes the Nest application context, invokes provider shutdown hooks, clears plugin timers, and disconnects Prisma.

## Topologies and scale trigger

Start with `combined`. Move to split mode when any of these is sustained for 15 minutes:

- API p95 latency is above 500 ms while scheduled work is active but returns below 500 ms when it stops.
- Background work consumes more than 30% of the API container CPU.
- A scheduled cycle lasts more than half of its interval.
- Operational isolation is needed so an API replacement does not interrupt a long-running job.

Split Compose mode uses `PROCESS_ROLE=api docker compose --profile split-worker up`. The worker shares the database and plugin data but does not receive a public port. Cron jobs other than plugin jobs currently rely on a single worker replica; horizontal worker scaling remains disabled until those three core cron paths also use durable claims. Plugin jobs are already concurrency-safe across replicas.

## Remaining acceptance evidence

- Run combined and split profiles against PostgreSQL and prove each scheduled fixture fires once.
- Send `SIGTERM` during a controlled long-running fixture and record drain/retry behavior.
- Confirm the API has zero registered cron jobs in split mode and that two worker replicas serialize the same plugin job live.
