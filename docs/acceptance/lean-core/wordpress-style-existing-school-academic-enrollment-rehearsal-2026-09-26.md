# Existing-school Academic enrollment restored-backup rehearsal — 2026-09-26

> 2026-09-28 follow-up: the aggregate Academic Management cutover-readiness gate now requires
> enrollment interval count/hash parity and a reconciled backup-bound enrollment journal. An
> independently passing enrollment rehearsal can no longer be omitted from the final cutover decision.

## Scope

This rehearsal certifies conversion of current legacy `Student.classId` relationships into dated
Academic Management enrollment intervals. It uses representative student, teacher and class records
and retains both the legacy relationship and plugin interval datasets through routing rollback.

## Executable gate

`backend/scripts/academic-enrollment-restored-backup-certification.js` requires an exact destructive
guard, distinct source and target databases, a safe target database name and a non-root backup
directory. It performs a school-bound PostgreSQL backup, isolated restore, immutable plugin
migrations, read-only/zero-write inspection, one-row journaled adoption, exact count and SHA-256
reconciliation, official rollback, and source/target preservation checks.

The `existing-school-academic-enrollment-rehearsal` PR job repeats the drill and retains a non-secret
JSON report.

## Local live result

The production-shaped PostgreSQL 16 Docker drill passed on 2026-09-26:

```text
format: wattanam-existing-school-academic-enrollment-rehearsal-v1
source database: source_enrollment
rehearsal database: restored_enrollment
backup: wattanam-20260926T072057Z.dump
enrollment intervals: 2
source SHA-256: 298d9b376598c88d9e2b14d2300b1211fee231595b0d9c616bb9741a05d6d566
target SHA-256: 298d9b376598c88d9e2b14d2300b1211fee231595b0d9c616bb9741a05d6d566
dry-run zero-write: true
adopted: true
rolled back: true
legacy preserved: true
plugin data preserved: true
```

All explicitly named disposable Docker resources were removed after the drill.

Repository verification after adding the ownership and CI gate:

```text
npm run test:existing-school:academic-enrollment: 3 passed, 0 failed
node --test tools/existing-school-rehearsal-contract.test.js: 8 passed, 0 failed
npm run test:tools: 84 passed, 0 failed
```

## Remaining acceptance

- Retain the first hosted green run and report artifact.
- Certify classes, subjects, admissions, study years and aggregate Academic cutover readiness.
- Run browser parity and school-owner acceptance on an approved anonymized restored school.
- Preserve legacy enrollment relationships throughout the documented rollback window.
