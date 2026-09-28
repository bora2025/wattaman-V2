# Existing-school Attendance Study Years rehearsal gate — 2026-09-28

## Result

Legacy Study Years have a required restored-backup migration gate into Attendance Manager. The
guarded implementation, CI contracts and PostgreSQL 16 execution pass locally.

Attendance Manager is also the sole runtime route owner. Academic Management retains its historical
published migration unchanged, but no longer registers Study Year routes; it resolves Study Year
data for classes through Attendance Manager's versioned read model.

## Coverage

- multiple legacy years with date ranges, branding, labels, and exactly one current year;
- source-school backup and restore into a distinct empty PostgreSQL database;
- immutable Attendance Manager migration verification before adoption;
- zero-write dry-run with no journal creation;
- bounded, resumable and backup-bound adoption;
- exact row count, current-year count, and SHA-256 parity;
- metadata-only rollback retaining legacy and plugin rows.

## Automated evidence

- configuration safety tests require the exact allow guard, distinct databases, a safe target name,
  and a non-root backup directory;
- the existing rollback drill remains non-destructive;
- PR validation retains a non-secret JSON result as
  `existing-school-attendance-study-years-rehearsal`.
- The 2026-09-28 PostgreSQL run restored and adopted two Study Years with exactly one current year.
  Source and target SHA-256 fingerprints both equalled
  `ef19a87e199395e731ca3a848e7b9459e0b1bb47e0df1a02f12ea1b95768bde2`; dry-run zero-write,
  adoption, rollback, legacy preservation and plugin-data preservation all passed. The non-secret
  result is retained in
  `wordpress-style-existing-school-attendance-study-years-result-2026-09-28.json`.

## Remaining acceptance

Retain the first hosted CI result. Attendance Manager still requires complete restored-backup
coverage for sessions, holidays, identifiers, records, scans, corrections, alerts, and formatting
before its aggregate cutover can be approved.
