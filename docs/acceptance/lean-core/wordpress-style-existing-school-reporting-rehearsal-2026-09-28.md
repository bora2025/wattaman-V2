# Existing-school Reporting restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution and production approval pending**

## Scope and result

Reporting is a stateless composition plugin: it owns no database tables and has no adoption copier.
This gate therefore restores a representative school backup, fingerprints its legacy roster, runs
the real Reporting plugin against versioned provider read models, and verifies the roster remains
unchanged afterward.

The restored execution passed administrator-only authorization, student-keyed bulk reads, approved
student and staff totals, optional-provider degradation, privacy minimization and spreadsheet-
formula-safe CSV output. The restored legacy roster fingerprint was preserved exactly:

`4ecdb585cccd10fddf2e79c9f7904ff3035695e5f840889cfdbdea697c121652`

Reporting created zero namespaced tables and left zero certification read-model rows. The machine
result is retained in `wordpress-style-existing-school-reporting-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now restores PostgreSQL 16 and runs this parity gate, uploading its
non-secret result. Remaining work is the first remote artifact, approved production-school totals,
hosted-backup execution, browser print/PDF and accessibility checks, lifecycle validation, cutover
approval, and school pilot evidence.
