# MP2 Academic CSV roster import — 2026-09-25

## Result

Academic Management 0.1.10 owns the compatibility CSV roster-import workflow. In plugin owner mode,
core forwards the bounded CSV text to `POST classes/:id/students/bulk-csv`; it no longer invokes
the legacy Classes service or legacy Student table.

## Contract and safety

- Administrator-only route with a 2 MiB and 2,000-row limit.
- Quoted CSV parsing, required Name column, duplicate student-number detection, bounded identifiers,
  validated email/date/password and Khmer/English sex normalization.
- Existing roster identities use the capability-gated `accounts.student.update` command. The
  immutable command key includes the normalized identity hash so changed imports remain auditable
  while exact retries are safe.
- New identities use the fixed `csv-create:<class>:<student-number>` command, allowing a retry after
  account creation to receive the original core User and finish plugin materialization.
- Student Profile and Enrollment Interval mutations use only Academic namespaced storage. New
  materialization publishes a durable, deterministic imported-student event in its transaction.
- Row failures are isolated and returned with row number and reason; aggregate counts match the
  detail list.

## Verification

- Academic reference plugin: 15/15 tests passed, including one new and one existing roster row.
- Classes compatibility controller plus account adapter: 8/8 focused tests passed.
- Combined runtime/account/controller/SDK backend verification: 23/23 passed; public SDK: 12/12.
- Academic plugin CLI validation passed and the backend compiled 304 files.
- Architecture inventory gate passed with 1,437 discovered items owned and 83 models classified.
- No CSV import SQL references legacy `User`, `Student` or `Class` tables.

Real PostgreSQL concurrency, hosted file upload and restored-backup cutover remain under MP2-009.
