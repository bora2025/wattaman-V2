# Existing-school Attendance Manager restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope

This gate restores one representative legacy school and migrates the complete student school-day
Attendance boundary into Attendance Manager: Study Years, class sessions, holidays, student card
identifiers, format rules, and attendance records. Staff, lesson, and course attendance remain with
their separately assigned plugin owners and are intentionally outside this boundary.

## Safety and execution

`attendance-manager-restored-backup-certification.js` requires the exact
`EXISTING_SCHOOL_REHEARSAL_ALLOW=attendance-manager-only` guard, distinct PostgreSQL source and
target URLs, a safe new target database name, and a non-root absolute backup directory. It creates
a verified custom-format backup, restores into a new database, verifies immutable plugin
migrations, performs a zero-write dry run, adopts all six datasets in dependency order with a
chunk size of one, reconciles canonical SHA-256 fingerprints, and executes routing rollback. The
source database and both restored datasets remain intact.

The local PostgreSQL 16 run passed with one representative row in every dataset:

```text
Study Years: 1
sessions: 1
holidays: 1
identifiers: 1
format rules: 1
attendance records: 1
source SHA-256 = target SHA-256
dry-run zero write: true
adoption reconciled: true
rollback completed: true
legacy preserved: true
plugin data preserved: true
```

The rehearsal exposed and fixed an actual production-adapter defect: normalized ISO timestamp
values now carry explicit PostgreSQL timestamp casts during every applicable dataset insert. The
non-secret machine report is retained in
`wordpress-style-existing-school-attendance-manager-result-2026-09-28.json`.

## CI enforcement

Required PR validation provisions PostgreSQL 16, runs the safety contract, performs the full
backup/restore/adopt/rollback rehearsal, and uploads its JSON report.

## Remaining acceptance

- Obtain the first remote CI artifact.
- Repeat on an approved anonymized hosted backup.
- Complete hosted browser, camera/QR, USB-scanner and report parity.
- Obtain pilot-school and specialist approval before retiring any legacy Attendance table or route.
