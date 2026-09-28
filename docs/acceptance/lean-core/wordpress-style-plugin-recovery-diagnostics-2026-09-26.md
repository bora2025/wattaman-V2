# WordPress-style plugin recovery and diagnostics evidence

Date: 2026-09-26  
Scope: local kernel implementation and failure-path verification

## Recovery coverage

- Scheduled recovery sets bind a PostgreSQL custom dump, the complete installed-plugin directory and
  mutable plugin-data directory into one checksum journal.
- The backup status API now discovers recovery-set journals separately from database-only backups,
  reports database/plugin-code/plugin-data coverage, artifact presence and file counts without
  exposing server paths.
- Restore verifies all archive digests, rejects unsafe tar paths, extracts both plugin archives into
  isolated same-volume staging directories, and verifies exact file lists and SHA-256 values before
  attempting the database restore.
- A database restore failure removes staging and leaves both live plugin directories untouched.
- After database success, guarded directory swaps replace rather than overlay live directories, so
  stale plugin files cannot survive. A failed second swap rolls the first one back.

## Diagnostics

`GET /plugins/diagnostics` gives a SUPER_ADMIN one aggregate result covering:

- registry and installed-artifact consistency;
- active-registry versus loaded-runtime drift;
- paid-plugin entitlement mode and reason;
- contract/dead-letter health;
- background-job last state and error;
- safe mode and an overall healthy/degraded/failed decision.

Plugin Manager renders the aggregate result and actionable per-plugin problems.

## Verification

- Backup and plugin service suites: 25 tests passed.
- Recovery contract tests: 2 tests passed.
- A subprocess recovery failure test creates real tar archives, verifies/stages them, deliberately
  fails the PostgreSQL restore, and proves the original live plugin and data sentinels remain.
- Restore script syntax, backend TypeScript and frontend TypeScript checks pass.

## Remaining acceptance gap

A production-shaped PostgreSQL restore into a clean Railway project and an equivalent self-hosted
Docker restore must still prove database, plugin registry, plugin code, mutable files, runtime health
and business-data reconciliation together. This item remains **in progress** until those drills are
recorded.
