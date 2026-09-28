# Existing-school Document Designer restored-backup rehearsal — 2026-09-26

## Scope

This is the first complete existing-school vertical rehearsal for the WordPress-style reform. It
proves the dependency-independent Document Designer path against real PostgreSQL 16. It does not
certify the remaining plugins or authorize a production-school cutover.

## Executable gate

`backend/scripts/document-designer-restored-backup-certification.js` requires an exact destructive
guard and two distinct PostgreSQL URLs. It:

1. deploys the immutable `legacy-full` migrations into a disposable source database;
2. creates a school identity and representative legacy active/general templates containing two
   references to the same embedded one-pixel PNG;
3. creates a real custom-format, checksum-bound, school-bound `pg_dump`;
4. refuses an existing rehearsal database, creates a separate empty target and restores the dump;
5. applies the official plugin's immutable additive migration;
6. runs the read-only preflight and approval-bound zero-write dry-run, requiring the embedded
   asset to resolve to one content hash with two references;
7. adopts in one-row chunks, reconciles the complete source and target hashes, and grants roles;
8. copies the deduplicated embedded image into plugin-scoped storage, adds deterministic asset IDs
   only to plugin-owned designs, and retains the legacy sources;
9. activates the real plugin backend against the restored database, generates the adopted active
   template, and requires its page frame, image geometry/style and converted scoped-asset identity
   to match the representative legacy input;
10. exercises plugin-to-legacy routing rollback; and
11. verifies that legacy rows, plugin rows, and the complete embedded-asset inventory remain intact
   after rollback.

The `existing-school-upgrade-rehearsal` PR job repeats the sequence on PostgreSQL 16 and retains a
non-secret JSON report. Contract tests prevent removal of the source/target isolation, backup,
restore, dry-run, reconciliation, rollback or artifact gate.

## Local live result

The production-shaped Docker drill passed on 2026-09-26:

```text
format: wattanam-existing-school-document-designer-rehearsal-v1
source database: source_school
rehearsal database: restored_school
backup: wattanam-20260926T070440Z.dump
legacy rows: 2
source SHA-256: 112cea7725dc5e2f694dd29cd3d284d9f374abc464638d6a71ed4a3b28279f61
target SHA-256: 112cea7725dc5e2f694dd29cd3d284d9f374abc464638d6a71ed4a3b28279f61
dry-run zero-write: true
adopted: true
rolled back: true
legacy preserved: true
plugin data preserved: true
permission grants: 12
```

The disposable source/target databases, backup volume, container and network were removed after
the drill.

The rehearsal source was strengthened on 2026-09-28 to include the real embedded-asset and rendered
output assertions above. The enhanced rehearsal then passed against a fresh PostgreSQL 16 target:

```text
source rows: 2
source/target SHA-256: 0ce2b2cb93460fc894c5f3e086bd502d4a8c01a6057e78a44e455d378e8be898
unique embedded assets: 1
legacy asset references: 2
embedded bytes: 68
scoped assets written: 1
rendered output verified: true
dry-run zero-write: true
adopted / rolled back: true / true
legacy / plugin data preserved: true / true
permission grants: 12
```

The non-secret machine-readable result is retained in
`wordpress-style-existing-school-document-designer-result-2026-09-28.json`. Focused safety
contracts also pass 3/3. This closes the enhanced local PostgreSQL rehearsal; the hosted artifact
and browser pixel/output proof remain separate acceptance gates.

Repository verification also passed after registering the rehearsal under the Document Designer
owner and regenerating the architecture snapshot:

```text
npm run test:tools: 78 passed, 0 failed
git diff --check: passed
```

## Remaining acceptance

- Retain the first hosted green run and its report artifact.
- Repeat the restored-backup pattern for Academic Management and every dependent plugin in the
  documented dependency order.
- Run browser parity and school-owner acceptance on an approved anonymized restored school.
- Keep legacy data and routing compatibility through the required rollback window.
