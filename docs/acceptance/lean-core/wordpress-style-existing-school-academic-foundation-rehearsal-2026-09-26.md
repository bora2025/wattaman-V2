# Existing-school Academic foundation restored-backup rehearsal — 2026-09-26

## Scope

This rehearsal certifies the first Academic Management existing-school boundary: legacy departments
and user-department memberships. It uses representative records on PostgreSQL 16 and preserves the
legacy and plugin datasets through routing rollback. It does not yet certify Academic classes,
profiles, admissions, enrollment, subjects or study years.

## Executable gate

`backend/scripts/academic-management-restored-backup-certification.js` requires the exact
`academic-management-foundation-only` destructive guard, distinct source and rehearsal databases,
a safe target database name and a non-root backup directory. It:

1. deploys the immutable legacy-full migrations to a disposable source;
2. seeds two departments and two user memberships;
3. creates a school-bound, checksum-bound custom-format PostgreSQL backup;
4. refuses an existing target database and restores into a separately created empty database;
5. applies all immutable Academic Management plugin migrations;
6. performs a zero-write preflight/dry-run and proves it created no rows or journal;
7. adopts both datasets in one-row chunks and reconciles their exact combined SHA-256;
8. rolls both routing journals back to the legacy owner; and
9. verifies that the source fingerprint and plugin target rows remain intact.

The `existing-school-academic-foundation-rehearsal` PR job repeats this sequence and retains its
non-secret JSON report as a required artifact.

## Local live result

The production-shaped Docker drill passed against PostgreSQL 16 on 2026-09-26:

```text
format: wattanam-existing-school-academic-foundation-rehearsal-v1
source database: source_academic
rehearsal database: restored_academic
backup: wattanam-20260926T071244Z.dump
departments: 2
memberships: 2
source SHA-256: e86a12c59ac8c15c66e226c2b865613aa65e6d65f55e1830dd46921ff0cb37ed
target SHA-256: e86a12c59ac8c15c66e226c2b865613aa65e6d65f55e1830dd46921ff0cb37ed
dry-run zero-write: true
adopted: true
rolled back: true
legacy preserved: true
plugin data preserved: true
```

The explicitly named disposable container, network, source/target database volume and backup volume
were removed after the drill.

Repository verification after registering the new ownership and CI gate:

```text
npm run test:existing-school:academic-foundation: 3 passed, 0 failed
node --test tools/existing-school-rehearsal-contract.test.js: 4 passed, 0 failed
npm run test:tools: 80 passed, 0 failed
```

## Remaining acceptance

- Retain the first hosted green run and report artifact.
- Add restored-backup rehearsals for the remaining Academic Management boundaries in dependency
  order, then certify its aggregate cutover-readiness gate.
- Run browser parity and school-owner acceptance against an approved anonymized restored school.
- Preserve all legacy data through the documented rollback window.
