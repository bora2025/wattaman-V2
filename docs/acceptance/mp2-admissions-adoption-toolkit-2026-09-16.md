# MP2 Admissions Adoption Toolkit — Local Evidence

Date: 2026-09-16
Status: implemented (dry-run/adopt toolkit), no plugin-owned admissions writes enabled yet

This increment adds backup-bound, journaled admissions migration mechanics on top of the new preflight.

Implemented:

- `backend/scripts/academic-admissions-adopt.js`
- `backend/scripts/academic-admissions-adopt.test.js`
- `backend/package.json` scripts:
  - `db:academic-admissions:adopt`
  - `db:academic-admissions:dry-run`
  - `test:academic-admissions:adopt`

Toolkit behavior:

- Strict non-interactive confirmation and fingerprint matching.
- School-bound verified-backup requirement before execution.
- Journaled, resumable multi-phase additive copy:
  - class registrations (chunked by id)
  - settings singleton
  - custom fields (chunked by id)
- Crash-safe resume with maintenance lock and idempotent chunk keys.
- Fail-closed guards for non-empty targets without matching journal and source-fingerprint drift.
- Post-copy reconciliation by re-running deterministic preflight on source and target projections.
- No legacy row mutation and no route-owner cutover in this step.

Validation status in this session:

- Static diagnostics report no errors in changed files.
- Terminal command output remains unavailable in this session, so pass/fail execution capture for
  new admissions adopt tests is pending.

Follow-up:

- Add admissions rollback-drill and cutover-readiness parity checks.
- Add namespaced admissions migrations and plug toolkit against installed target tables.
- Replace submit/resolve plugin stubs with certified namespaced write handlers.
