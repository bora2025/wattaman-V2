# Existing-school Academic classes restored-backup rehearsal — 2026-09-26

## Scope

This rehearsal certifies the Academic Management class boundary with representative teacher and
class-administrator ownership, study-year linkage, schedules, public registration state,
descriptions and pricing. Legacy and plugin class rows remain preserved through routing rollback.

## Executable gate

`backend/scripts/academic-classes-restored-backup-certification.js` requires an exact destructive
guard, distinct PostgreSQL source and target databases, a safe target name and non-root backup
directory. It runs a school-bound backup, isolated restore, immutable plugin migrations, zero-write
dry-run, one-row journaled adoption, exact SHA-256 reconciliation, official rollback and preservation
checks. The `existing-school-academic-classes-rehearsal` CI job repeats the process and retains a
non-secret JSON report.

## Local live result

The production-shaped PostgreSQL 16 Docker drill passed on 2026-09-26:

```text
format: wattanam-existing-school-academic-classes-rehearsal-v1
source database: source_classes
rehearsal database: restored_classes
backup: wattanam-20260926T072437Z.dump
classes: 2
source SHA-256: 523c5f98abc9cc365ec114592f5f8f737226781c21ebf72f1ce7e54e72c41fc4
target SHA-256: 523c5f98abc9cc365ec114592f5f8f737226781c21ebf72f1ce7e54e72c41fc4
dry-run zero-write: true
adopted: true
rolled back: true
legacy preserved: true
plugin data preserved: true
```

All explicitly named disposable Docker resources were removed after the drill.

Repository verification after adding the ownership and CI gate:

```text
npm run test:existing-school:academic-classes: 3 passed, 0 failed
node --test tools/existing-school-rehearsal-contract.test.js: 10 passed, 0 failed
npm run test:tools: 86 passed, 0 failed
```

## Remaining acceptance

- Retain the first hosted green run and report artifact.
- Certify subjects, admissions, study years and the aggregate Academic cutover-readiness gate.
- Run browser parity and school-owner acceptance on an approved anonymized restored school.
- Preserve legacy class storage throughout the documented rollback window.
