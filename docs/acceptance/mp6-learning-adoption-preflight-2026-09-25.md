# MP-6 Learning adoption toolkit — local acceptance evidence

Date: 2026-09-25

Status: local implementation accepted; restored-backup execution on real PostgreSQL remains open.

## Scope

The Learning adoption toolkit covers all 13 legacy/plugin datasets in dependency order:
assignments, submissions, quiz questions, quiz answers, courses, lessons, pages, enrollments,
lesson attempts, page responses, course sessions, course attendance and lesson views.

## Implemented controls

- The preflight is read-only and emits only counts and SHA-256 fingerprints; assignment content,
  answer keys, student responses, names and contact details are excluded from output.
- Normalization validates timestamps, JSON, bounds, lifecycle values and parent relationships.
- Adoption requires non-interactive execution, an exact school-slug confirmation, the approved
  source fingerprint, and a verified school-bound recovery backup.
- A durable per-dataset journal and idempotency keys allow copying to resume after a crash.
- Source data is fingerprinted again after copying; every target dataset must match exact counts
  and canonical hashes before the journal can become `reconciled`.
- Rollback requires that reconciled journal and backup identity, changes routing metadata only,
  and preserves both the legacy and plugin datasets.

## Verification

```text
node --test backend/scripts/learning-adoption-preflight.test.js backend/scripts/learning-adopt.test.js
tests 6; pass 6; fail 0
```

The focused plugin suites also pass 27 tests, the backend compiles 309 files, and the architecture
inventory gate passes. These local checks do not prove PostgreSQL SQL execution, restored production
backup adoption, hosted cutover, or rollback timing. Those gates remain open.
