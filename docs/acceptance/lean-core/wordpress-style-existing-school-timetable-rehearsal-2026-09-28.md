# Existing-school Timetable restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope

This gate restores one representative legacy school and migrates the complete Timetable boundary:
documents, subjects, timetable classes, classrooms, teachers, lessons, generated entries, and
teacher lesson-attendance records. It proves relational ordering and parity across all eight
datasets, not merely that the empty plugin schema installs.

## Safety and result

The command requires the exact `EXISTING_SCHOOL_REHEARSAL_ALLOW=timetable-only` guard, distinct
PostgreSQL source and target URLs, a safe new target database name, and a non-root absolute backup
directory. It creates a verified custom-format backup, restores to a new database, applies the
checksum-pinned plugin lineage, runs a zero-write dry run, adopts in one-row chunks, reconciles
canonical SHA-256 fingerprints, and performs non-destructive routing rollback.

The local PostgreSQL 16 run passed with one related row in every dataset. Source and target hashes
matched exactly (`e828e67578c8920877021640c37b2e45c52901db28bfe0b244398d015411b1c9`), and both
legacy and plugin datasets remained intact after rollback. The run also validated explicit
PostgreSQL timestamp typing in the production adoption adapter.

The non-secret result is retained in
`wordpress-style-existing-school-timetable-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now runs the safety contract and complete PostgreSQL 16 rehearsal and
uploads the JSON result. Remaining work is the first remote CI artifact, an approved anonymized
hosted backup, browser/device scheduling parity, hosted lifecycle validation, and pilot approval.
