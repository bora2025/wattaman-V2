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

## Verification

- `backend` build, typecheck, and the full test suite (45 suites/231 tests) pass;
  `backup.service.spec.ts` gained two tests for `scheduledBackup()` (logs and never throws on
  failure; calls `createRecoverySet()` exactly once on success).
- `backup-restore-drill.js`'s CLI argument handling was verified directly: `--help` prints
  correctly, and it fails loudly and immediately (exit 1, clear message) when `DATABASE_URL` or
  `RESTORE_DATABASE_URL` is missing, before touching anything.
- `.github/workflows/quarterly-restore-drill.yml` was validated with `actionlint` (0 issues).
- **A full live run of the drill was completed end to end** against two real disposable
  PostgreSQL 16 containers (source and target), reproducing the workflow's Linux environment
  from a Windows host via an isolated container (never touching the shared host
  `node_modules`, matching the established pattern from B-012/B-003). Result: **`passed: true`**
  — 78 tables, zero unexplained row loss, zero content drift in any table, zero foreign-key
  orphans after restore (`exactMatch: true`), and a measured RTO of **1.3 seconds** against the
  14400-second (4h) target. The full report is reproduced below.
- Getting to that clean run surfaced and fixed four real, worth-recording issues:
  1. Copying the host's already-`npm install`ed `backend/` directory into a Linux container
     carries Windows-built `node_modules` (native bindings, and npm's `.bin` shims invoking
     `node.exe`) into a Linux runtime — breaks `prisma generate`'s postinstall hook. Fixed by
     deleting `node_modules`/`dist` after copying, before installing fresh.
  2. A minimal `node:20-slim` container has no OpenSSL installed by default; Prisma's schema
     engine needs it and fails with an unhelpfully terse "Schema engine error:" without it. The
     production `backend/Dockerfile` already installs `openssl` explicitly for exactly this
     reason.
  3. `create-synthetic-legacy-fixture.js` turned out to be the wrong seeding tool for this drill:
     it deliberately refuses a target whose `ADOPT_DATABASE_URL` equals `DATABASE_URL`, and
     separately refuses a target that already has Prisma migration history (both real,
     intentional B-001/002/003 safety gates, not bugs) — this drill's source is migrated and is
     intentionally its own primary database. Switched to seeding real rows directly through
     Prisma instead (an `Installation`, a `Department`, 5 `User` rows), which is the correct tool
     for "prove restore fidelity," as distinct from "prove legacy adoption," which is what the
     fixture generator is actually for.
  4. **A real bug in `backup-restore-drill.js` itself**: its `runScript()` helper assumed every
     wrapped script's last stdout line is JSON, but `restore-recovery-set.js` prints a
     human-readable summary line, not JSON — crashing the drill with `SyntaxError: Unexpected
     token 'R'... is not valid JSON` on every successful restore. Fixed: `runScript()` now
     returns `{}` on a non-JSON last line rather than throwing, since only the
     `backup-recovery-set.js` call site's return value (the journal) is actually consumed by the
     caller.
- One artifact of the drill's own synthetic seed data, not a defect: the report's
  `credentialIntegrity.allPasswordHashesValid` is `false` because the seeded test users have a
  literal placeholder string (`'not-a-real-hash-just-drill-data'`) instead of a real bcrypt
  hash — `credentialFormatCheck()` is correctly flagging that. This is informational only and
  does not affect `passed`, matching `legacy-compare.js`'s existing design (credential format is
  about the *source*'s data shape, not restore fidelity).

<details>
<summary>Full drill report (78 tables, 5 synthetic users, single run)</summary>

```json
{
  "format": "wattanam-restore-drill-report-v1",
  "drillStartedAt": "2026-08-29T13:48:28.435Z",
  "backup": {
    "startedAt": "2026-08-29T13:48:33.378Z",
    "completedAt": "2026-08-29T13:48:33.647Z",
    "durationSeconds": 0.269,
    "journalFile": "wattanam-recovery-20260829T134833Z.recovery-set.json"
  },
  "restore": {
    "startedAt": "2026-08-29T13:48:33.648Z",
    "completedAt": "2026-08-29T13:48:34.943Z"
  },
  "rto": { "measuredSeconds": 1.295, "targetSeconds": 14400, "withinTarget": true },
  "identity": {
    "tableCount": 78,
    "unexplainedRowLoss": [],
    "tablesWithChangedContent": [],
    "foreignKeyOrphansAfter": [],
    "credentialIntegrity": { "usersChecked": 5, "allPasswordHashesValid": false },
    "exactMatch": true
  },
  "passed": true,
  "reportSha256": "2ed504648f48b9603b4404ee12eda77d3348316cd59f0366051a6183b92e85c7"
}
```

</details>

## What this does not close

- No CI run of `quarterly-restore-drill.yml` has actually executed yet (it can be triggered
  manually via `workflow_dispatch` without waiting for the next quarter boundary). The local
  drill run proves the *script's* correctness; it does not prove the *workflow YAML* runs
  cleanly on a real GitHub-hosted Ubuntu runner, which remains genuinely untested.
- The drill has been run once, against a modest synthetic dataset (78 tables, single-digit row
  counts) — not against a real production-shaped installation recovery set with realistic data
  volumes, nor repeated enough times to rule out flakiness.
- `BackupController`'s admin-facing status endpoint was not changed; an operator still can't
  trigger a drill or see drill history through the API, only through CI artifacts.
