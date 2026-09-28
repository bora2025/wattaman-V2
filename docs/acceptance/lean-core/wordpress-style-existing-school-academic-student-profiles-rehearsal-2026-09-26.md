# Existing-school Academic student-profile restored-backup rehearsal — 2026-09-26

## Scope

This rehearsal certifies the Academic Management student-profile boundary with representative
legacy student and guardian identities, profile attributes, birth dates, QR codes and custom field
values. It preserves legacy `Student` rows and plugin rows through routing rollback. Enrollment,
classes, subjects, admissions and study years remain separate boundaries.

## Executable gate

`backend/scripts/academic-student-profiles-restored-backup-certification.js` requires an exact
destructive guard, distinct source and rehearsal databases, a safe target database name and a
non-root backup directory. It creates a school-bound PostgreSQL backup, restores it into an empty
separate database, applies immutable Academic plugin migrations, proves the dry-run makes no write
or journal, adopts in one-row chunks, reconciles exact counts and SHA-256, runs the official routing
rollback drill, and verifies source and target preservation.

The `existing-school-academic-student-profiles-rehearsal` PR job repeats this process and retains a
non-secret JSON report.

## Local live result

The production-shaped PostgreSQL 16 Docker drill passed on 2026-09-26:

```text
format: wattanam-existing-school-academic-student-profiles-rehearsal-v1
source database: source_profiles
rehearsal database: restored_profiles
backup: wattanam-20260926T071645Z.dump
student profiles: 2
source SHA-256: 9f0b92b4d590bd5f299ece3ca555814c5e693fa5465ca2652992b20c93ca94e2
target SHA-256: 9f0b92b4d590bd5f299ece3ca555814c5e693fa5465ca2652992b20c93ca94e2
dry-run zero-write: true
adopted: true
rolled back: true
legacy preserved: true
plugin data preserved: true
```

All explicitly named disposable Docker resources were removed after the drill.

Repository verification after adding the ownership and CI gate:

```text
npm run test:existing-school:academic-student-profiles: 3 passed, 0 failed
node --test tools/existing-school-rehearsal-contract.test.js: 6 passed, 0 failed
npm run test:tools: 82 passed, 0 failed
```

## Remaining acceptance

- Retain the first hosted green run and report artifact.
- Certify the remaining Academic boundaries and aggregate cutover-readiness gate.
- Run browser parity and school-owner acceptance on an approved anonymized restored school.
- Preserve the legacy profiles throughout the documented rollback window.
