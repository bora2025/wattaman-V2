# WordPress-style Attendance Manager PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Published migration compatibility

Attendance Manager `0.1.x` contains an immutable headerless initial migration and four later
checksum-pinned multi-statement migrations. The installer now recognizes only the exact published
plugin/migration/checksum triples and executes their simple statements inside the surrounding
installation transaction. Altered bytes, another plugin ID, or any new multi-statement migration
remain rejected. SQL safety validation ignores documentation comments while continuing to reject
executable transaction, role, grant, copy and extension operations.

## Certification command

`npm run certify:attendance:postgres` requires the exact
`ATTENDANCE_CERTIFY_ALLOW_DROP=attendance-manager-only` guard and operates only on the
`plugin_wattanam_attendance_manager_` namespace. It:

- verifies every immutable migration checksum and required identity header or the exact published
  `001` compatibility checksum;
- installs the full migration lineage on PostgreSQL;
- activates the actual Attendance Manager plugin with a PostgreSQL-backed database adapter;
- exercises concurrent current-Study-Year selection and proves exactly one remains current;
- records student attendance while rejecting the staff domain at the API boundary;
- corrects attendance and verifies the immutable previous/new-value audit record;
- verifies summary and CSV report parity with stored identity snapshots;
- verifies the published student projection excludes marker identity; and
- runs the real absence-alert job through student and parent in-app/realtime delivery ledgers.

The PostgreSQL 16 PR backend job runs this command after the foundation and Document Designer
certifications.

## Local verification

- Migration compatibility, SQL guard and Attendance runtime suites: 22 passed.
- Certification guard/migration harness: 2 passed.
- Backup-bound adoption, reconciliation and non-destructive rollback suites: 9 passed.
- Architecture and clean-core gates are rerun whenever this evidence changes.

## Remaining acceptance gap

The first hosted PostgreSQL run, legacy client routing cutover, hosted report parity, camera/QR and
USB device/browser evidence, restored-backup execution and a controlled school pilot remain
required before production cutover.
