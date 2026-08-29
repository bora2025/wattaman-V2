# Gate B — Background Worker Boundary — 2026-08-29

## Implemented

- Validated `PROCESS_ROLE=combined|api|worker`, defaulting to the existing combined topology.
- Scheduler discovery is centralized and disabled in API-only processes.
- Plugin job definitions remain visible in API mode without creating timers.
- Dedicated `dist/worker` entrypoint provides database-backed readiness and graceful shutdown.
- Optional Compose `split-worker` profile uses the same immutable backend image and persistent data paths.
- Plugin jobs use a transaction-scoped PostgreSQL advisory lock for cross-worker no-overlap.

## Verification

- Backend production build: pass (193 compiled files).
- Backend regression: 40 suites, 214 tests pass.
- Focused role/plugin-job tests: 13 pass, including invalid roles, API timer suppression, duplicate definition rejection, and advisory-lock contention.
- `docker compose config --quiet`: pass with sealed validation-only values.

## Live drill (2026-08-29)

`backend/scripts/worker-boundary-live-drill.js` closes the three items named above as open,
spawning the real, unmodified `dist/main.js`/`dist/worker.js` entrypoints as real separate OS
processes against one real PostgreSQL 16 (run inside a Linux container, since Windows'
`child_process.kill('SIGTERM')` doesn't deliver a real POSIX signal a handler can catch — the
same cross-platform gap this engagement hit for `pg_dump`/Prisma's schema engine earlier).
13/13 checks pass:

- **Combined topology**: a single `PROCESS_ROLE=combined` process serves `/health/ready`.
- **Split topology**: a `PROCESS_ROLE=api` process and a `PROCESS_ROLE=worker` process run
  concurrently against the same database with no conflict; the worker's `/health/live` and
  `/health/ready` both report `role: "worker"`.
- **Two-worker no-overlap**: two real separate Node processes, each with its own PrismaClient
  connection (not a shared client), both call the real `PluginJobsService.run()` for the same
  `pluginId:jobId` at once. Exactly one actually runs the handler and exactly one `PluginJobRun`
  row is created — the PostgreSQL advisory lock genuinely serializes them, not just in the
  existing unit-level contention test.
- **Graceful shutdown**: all three roles (combined, split-api, split-worker) exit with code 0 on
  SIGTERM.

That last point surfaced a real, fixed bug. `main.ts` called `app.enableShutdownHooks()` with no
options; NestJS's default behavior (`nest-application-context.js`'s `listenToShutdownSignals`)
runs every cleanup hook correctly, then **removes its own signal listener and re-delivers the
same signal to itself** rather than calling `process.exit(0)` — so the process actually dies via
the raw, now-unhandled signal (`code: null, signal: 'SIGTERM'` in Node's own exit event), not a
clean exit. This is indistinguishable from a crash to anything watching the exit code
(monitoring, Railway, systemd), even though the drain itself ran correctly.
`worker.ts` already avoided this by calling `process.exit(0)` itself; `main.ts` now does the
equivalent via `app.enableShutdownHooks(undefined, { useProcessExit: true })`, confirmed by the
drill: before the fix, `child exited after 19ms, code=null, signal=SIGTERM`; after, `code=0`
consistently across combined and split-api roles.

## Remaining

Core cron paths are intentionally limited to one worker replica until they gain durable claims;
plugin jobs already support multiple workers safely, live-proven above.
