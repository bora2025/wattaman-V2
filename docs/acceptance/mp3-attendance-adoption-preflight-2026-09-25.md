# MP3 Attendance historical-adoption preflight — 2026-09-25

Status: **complete local toolkit; real-PostgreSQL execution remains**.

Attendance Manager 0.1.6 adds the last fields required to preserve the frozen legacy student
school-day boundary: permission start/end dates, identifier creator identity and student attendance
format rules. Migration `006_add_legacy_adoption_fields` is additive and checksum-pinned.

The read-only preflight inventories and independently fingerprints Study Years, class sessions,
holidays, student card/QR aliases, class-scoped student attendance-format rules and student
attendance records. It explicitly excludes staff attendance, staff sessions/rules, teacher lesson
attendance and course attendance.

Output contains counts and SHA-256 values only; it never prints student names, QR values or
attendance rows. Invalid status/session/date relationships, required fields, audit/scan timestamps,
scan modes, broken Study Year references, invalid thresholds, missing targets, populated targets,
unordered adapters and oversized chunks fail closed during preflight rather than failing partway
through the copy.

Verification:

- `npm run test:attendance:adoption` — 9/9 passed across preflight, malformed-source rejection,
  guarded dry-run, simulated
  crash-after-commit resume, exact six-dataset reconciliation, stale approval rejection and
  non-destructive rollback.
- Plugin CLI validated all six immutable migration files and checksums and activated the package in
  the SDK harness.

The operator commands are `db:attendance:preflight`, `db:attendance:dry-run`,
`db:attendance:adopt` and `db:attendance:rollback-drill`. The copier requires a verified
school-bound recovery backup, exact slug confirmation and the approved source fingerprint. It keeps
one journal with an independent cursor and committed-chunk history per dataset, replays chunks
idempotently after a crash, refuses source drift, and reconciles canonical count and SHA-256 for
every dataset before marking the journal complete. Rollback changes only routing metadata and keeps
both datasets.

MP3-013 remains partial until this toolkit is executed against PostgreSQL with a verified backup.
