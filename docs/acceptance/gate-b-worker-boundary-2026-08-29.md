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

## Open acceptance work

B-013 remains in progress until the combined/split live PostgreSQL fixture, graceful-shutdown drill, and live two-worker no-overlap check are recorded. Core cron paths are intentionally limited to one worker replica until they gain durable claims; plugin jobs already support multiple workers safely.
