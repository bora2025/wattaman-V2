# Existing-school Academic admissions rehearsal gate — 2026-09-28

## Result

The Academic Management admissions boundary has a required restored-backup CI rehearsal and safe
rollback contract. Its guarded PostgreSQL 16 execution passed on 2026-09-28.

## Covered datasets and states

- legacy class registrations, including representative `PENDING` and `REJECTED` states;
- the singleton registration-settings record;
- custom registration fields and representative JSON field values;
- exact source/target counts and canonical SHA-256 reconciliation;
- a backup of the source school restored into a distinct empty database;
- a dry run that writes no target rows and creates no journal;
- bounded, resumable adoption with a backup-bound journal;
- rollback by route-owner metadata only, retaining legacy and plugin datasets.

## Safety controls

- exact `EXISTING_SCHOOL_REHEARSAL_ALLOW=academic-admissions-only` guard;
- different PostgreSQL source and rehearsal URLs;
- restricted rehearsal database-name syntax;
- absolute, non-root backup directory;
- refusal to replace a pre-existing rehearsal target database;
- immutable Academic Management migrations applied only after restore;
- no destructive SQL in the admissions rollback drill.

## Automated evidence

- `npm run test:existing-school:academic-admissions`: 3/3 passing;
- `npm run test:academic-admissions:rollback-drill`: 3/3 passing;
- `node --test tools/existing-school-rehearsal-contract.test.js`: 14/14 passing;
- `.github/workflows/pr-validation.yml` parses successfully and retains the non-secret report as
  `existing-school-academic-admissions-rehearsal`.
- PostgreSQL 16 restored two registrations, one custom field and the singleton settings record.
  Source and target SHA-256 fingerprints both equalled
  `e32d8eb9365b81948e7790b79324227de7c37045952acb9c6cc6925aa78636dc`; the zero-write dry run,
  adoption, metadata-only rollback and data-preservation assertions all passed. The non-secret
  result is retained in
  `wordpress-style-existing-school-academic-admissions-result-2026-09-28.json`.

## Remaining acceptance

Retain the first hosted CI result, then complete aggregate Academic cutover, hosted/browser parity,
and a controlled school pilot.
