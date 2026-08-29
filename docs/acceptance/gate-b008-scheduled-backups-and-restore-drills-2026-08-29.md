# B-008 — Scheduled Backups and Quarterly Restore Drills — 2026-08-29

## What this implements

Plan acceptance bar: "Restore meets RPO/RTO and evidence is retained outside project."

- **Scheduling**: `BackupService.scheduledBackup()` (`backend/src/backup/backup.service.ts`)
  runs `@Cron('0 2 * * *')` — once daily, matching the 24h RPO target already stated in
  [reliability-and-slos.md](../operations/reliability-and-slos.md) — and calls the existing,
  already-proven `backup-recovery-set.js` (database + `PLUGIN_DIR` + `PLUGIN_DATA_DIR` as one
  journal, B-012). It's automatically skipped in API-only process role: `ScheduleModule.forRoot()`
  is already configured with `cronJobs` gated on `runsBackgroundJobs()` (the OPS-005
  worker-boundary work), so this needed no role-check of its own. A failed scheduled run is
  logged, never thrown — it must not crash the process, and the very `backup_age_seconds`/
  `backup_count` metrics this repo already exposes (Reliability/Observability pass) are the
  intended way an operator notices a string of failures, not a retry loop inside the cron job
  itself.
- **Restore drill**: new `backend/scripts/backup-restore-drill.js`. Backs up a source database
  (via `backup-recovery-set.js`), restores it into a completely separate target
  database/directories (`RESTORE_DATABASE_URL`, never the source — a routine drill must never
  risk touching real data), and proves **exact** identity by reusing `legacy-compare.js`'s
  `snapshot()`/`compare()` functions as a library — the same tool B-003 built, applied here to a
  stricter bar than adoption's tolerant "no *unexplained* loss" check: a restore drill demands
  zero content drift in *any* table, not just no missing rows. It measures wall-clock restore
  duration against a stated RTO target (`RTO_TARGET_SECONDS`, default 14400s = 4h, matching the
  plan's stated target) and writes a self-hashed `wattanam-restore-drill-report-v1` JSON report.
- **Quarterly automation**: `.github/workflows/quarterly-restore-drill.yml` — runs on the 1st of
  January/April/July/October (cron) plus `workflow_dispatch`, provisions two ephemeral
  PostgreSQL 16 service containers (source and target), seeds the source with a realistic
  multi-table synthetic fixture, runs the drill, and uploads the report as a build artifact with
  400-day retention — "evidence retained outside project" in the sense that matters for this
  repo: the report survives in GitHub's artifact storage independent of whatever ran the drill,
  not inside the ephemeral database being tested.

## Verification — what's real, and what's honestly not yet closed

- `backend` build, typecheck, and the full test suite pass with these changes; `backup.service.spec.ts`
  gained two tests for `scheduledBackup()` (logs and never throws on failure; calls
  `createRecoverySet()` exactly once on success).
- `backup-restore-drill.js`'s CLI argument handling was verified directly: `--help` prints
  correctly, and it fails loudly and immediately (exit 1, clear message) when `DATABASE_URL` or
  `RESTORE_DATABASE_URL` is missing, before touching anything.
- `.github/workflows/quarterly-restore-drill.yml` was validated with `actionlint` (0 issues).
- **What was not completed**: a full live run of the drill itself (real backup → real restore →
  real identity comparison) against real PostgreSQL data. Reproducing the workflow's Linux
  environment locally (this development machine is Windows) surfaced and fixed three real,
  worth-recording issues along the way before the attempt was stopped short of a full pass:
  1. Copying the host's already-`npm install`ed `backend/` directory into a Linux container
     carries Windows-built `node_modules` (native bindings, and npm's `.bin` shims invoking
     `node.exe`) into a Linux runtime — breaks `prisma generate`'s postinstall hook. Fix: delete
     `node_modules`/`dist` after copying, before installing fresh.
  2. `create-synthetic-legacy-fixture.js` requires `ALLOW_SYNTHETIC_LEGACY_FIXTURE=true` and
     `ADOPT_DATABASE_URL` explicitly (a deliberate safety gate from B-001/002/003, not a bug) —
     needed setting both to seed a drill fixture.
  3. A minimal `node:20-slim` container has no OpenSSL installed by default; Prisma's schema
     engine needs it and fails with an unhelpfully terse "Schema engine error:" without it. The
     production `backend/Dockerfile` already installs `openssl` explicitly for exactly this
     reason — the local reproduction attempt initially missed matching that.
  
  After fixing all three, the reproduction attempt was stopped (by explicit instruction) before
  completing a full pass. **This is a real, stated gap, not implied as done.** The good news: the
  friction above is specific to *simulating* a fresh Linux environment from a Windows host with
  pre-existing Windows-built artifacts in the way — the actual target environment
  (`quarterly-restore-drill.yml`'s GitHub Actions Ubuntu runner) starts from a genuinely clean
  Linux checkout with no such contamination, so none of these three issues should recur there.
  That claim itself is untested, though, and should not be treated as equivalent to an actual
  successful CI run.

## What this does not close

- No CI run of `quarterly-restore-drill.yml` has actually executed yet (it can be triggered
  manually via `workflow_dispatch` without waiting for the next quarter boundary).
- The drill has not yet been run against a real production-shaped installation recovery set —
  only against whatever fixture data a real run seeds.
- `BackupController`'s admin-facing status endpoint was not changed; an operator still can't
  trigger a drill or see drill history through the API, only through CI artifacts.
