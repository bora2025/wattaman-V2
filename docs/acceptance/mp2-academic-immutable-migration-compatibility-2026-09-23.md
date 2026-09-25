# Published plugin immutable migration compatibility

Date: 2026-09-23  
Scope: local source and contract verification; no hosted cutover claim

## Result

Academic Management migrations `003_create_enrollment_interval` through
`008_create_class_registration_field` retain the exact bytes and SHA-256 checksums published in
version 0.1.0. They were released before the installer required an identity-header comment, so the
installer now has a narrow compatibility rule instead of rewriting published migration history.

The exception is bound to all three values below:

- plugin ID `wattanam.academic-management`;
- the exact migration ID; and
- the original manifest and SQL SHA-256 checksum.

Changing the SQL, changing the declared checksum, using the same migration ID in another plugin,
or omitting the header from any new migration remains rejected. Migration 009 and every future
migration must use the normal identity header.

The same control protects Attendance Manager's published
`001_create_attendance_manager` migration. Version 0.1.0 shipped it as one headerless,
multi-statement migration. Version 0.1.2 retains that exact file, migration ID, checksum, and its
Academic Management dependency instead of replacing history with new IDs. The installer permits
multiple statements only for that exact checksum; every new migration remains single-statement.
For clean installations, the installer executes those known DDL statements individually inside
the existing plugin-install transaction, avoiding PostgreSQL prepared-statement limitations while
preserving atomicity and one immutable migration record.

## Verification

- All six restored files match their 0.1.0 manifest checksums.
- `plugin-migrations.service.spec.ts`: 7/7 passed, including Academic and Attendance positive,
  tamper-negative, transactional multi-statement execution, and normal validation of the new
  Attendance branding migration.
- Academic plugin CLI validation and activation harness: all checks passed.
- Attendance Manager plugin CLI validation and activation harness: all checks passed.
- Academic reference contract: 6/6 passed.
- Dependent contract fixtures: 6/6 passed.
- Academic identity, directory, and UI schema focused suites: 56/56 passed.
- Student-profile preflight/adoption/rollback suites: 9/9 passed.
- Unified Academic cutover-readiness suite: 3/3 passed.
- Backend production build passed.

## Remaining gate

This closes the local immutable-history compatibility defect. It does not replace restored-backup,
hosted lifecycle, backup/restore, rollback, or controlled-pilot evidence required to close MP-2.
