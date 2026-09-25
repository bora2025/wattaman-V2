# MP2 Academic teaching-subject ownership — 2026-09-25

Status: local implementation verified; hosted lifecycle certification remains open.

## Boundary

Academic Management 0.1.6 is the canonical owner of teaching-subject identity. Timetable may keep
schedule-local mappings but must consume Academic subject identifiers instead of reading Academic
tables. The existing free-text Class `subject` field remains available during adoption and rollback;
this slice does not destructively rewrite legacy data.

## Implemented

- Immutable `010_create_subject` migration with an identity header, unique bounded code, active
  lifecycle flag, and plugin-namespace-only storage.
- Administrator-only create and update routes. Authorization fails before database access.
- Versioned, bounded active-subject response at `GET contracts/subjects` for dependent plugins.
- Declarative list/create/edit UI, including a detail route that accepts both new UUID identifiers
  and deterministic `legacy-subject-*` identifiers produced by adoption.
- Durable subject-created and subject-updated outbox events inside the owner transaction.
- Declarative Subjects list/create page and permission-gated navigation.
- Ownership wording distinguishes canonical Academic identities from Timetable schedule mappings.
- Deterministic legacy adoption normalizes and case-folds distinct `Class.subject` values, creates
  stable IDs/codes, requires a verified school-bound backup and exact slug/fingerprint guards,
  journals reconciliation, resumes idempotently, and leaves every legacy Class row untouched.
- The rollback drill deletes only the deterministic adopted IDs and proves unrelated manually
  created subjects plus the legacy source remain intact.
- The unified Academic cutover-readiness gate now requires exact Subject fingerprint/count parity
  and a reconciled backup-bound Subject journal.

## Verification

- `node --test scripts/academic-management-reference-plugin.test.js`: 12/12 passed.
- `node packages/plugin-cli/bin/cli.js test plugins/wattanam.academic-management`: all manifest,
  checksum, entrypoint, and activation checks passed.
- `npm run architecture:inventory:gate`: 1,434 discovered items owned and 82 models classified.
- Subject preflight/adopt/rollback suites: 6/6 passed.
- Unified Academic cutover-readiness suite with Subject parity/journal enforcement: 3/3 passed.
- Academic reference-plugin suite: 13/13 passed; package CLI validation passed; backend compiled
  302 files; architecture inventory gate passed with 1,434 owned items and 82 classified models.

## Still open

- Run the verified adoption and rollback flow against a restored production-shaped backup.
- Hosted marketplace install/update/disable/re-enable/rollback evidence.
- Browser certification of the Subjects page and dependent Timetable/Examination contract use.
