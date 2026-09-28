# WordPress-style Timetable PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Dependency and release contract

Timetable `0.1.4` explicitly requires Academic Management `>=0.1.0 <1.0.0` for stable Academic
class identity. Teacher identity continues to use the core directory contract. This prevents a
lean-core school from activating Timetable without the class provider its routes actually use.
The release also publishes an extension-driven dashboard contribution and preserves every existing
migration byte and checksum.

Fresh timetable creation now persists `periodTimes`; previously the create route accepted the
field but omitted it from storage, breaking period-sensitive generation and teacher scanning.

## Certification command

`npm run certify:timetable:postgres` requires the exact
`TIMETABLE_CERTIFY_ALLOW_DROP=timetable-only` guard and operates only on the
`plugin_wattanam_timetable_` namespace. It:

- verifies and applies all ten immutable migrations;
- activates the actual plugin with a PostgreSQL-backed database adapter;
- creates a complete timetable graph using Academic class and core teacher directory references;
- proves generation preview is non-mutating;
- submits concurrent conflicting schedule entries and requires the database to accept exactly one;
- executes constrained atomic generation and verifies persisted entries; and
- concurrently upserts teacher lesson attendance, proves its unique identity, and reads the monthly
  report through the public plugin route.

The PostgreSQL 16 PR backend job runs this command after Attendance Manager certification.

## Local verification

- Timetable runtime, source, generator and teacher-attendance suites: 16 passed.
- Backup-bound adoption, reconciliation and rollback suites: 6 passed.
- Certification guard/migration harness: 2 passed.
- Architecture and clean-core gates are rerun whenever this evidence changes.

## Remaining acceptance gap

The first hosted PostgreSQL run, restored-backup execution, legacy route cutover, rich workspace
browser parity, drag/drop and print/export evidence, Wattaman scanner device evidence and a
controlled school pilot remain required before production cutover.
