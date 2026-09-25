# MP-3 Attendance Manager runtime database contract

Date: 2026-09-23  
Scope: local source and contract verification

## Result

Attendance Manager mutations now conform to the production plugin database API:

- `database.query` and transactional `query` are used only for `SELECT`.
- `INSERT`, `UPDATE`, and upsert operations use transactional `execute` without `RETURNING`.
- Each mutation reads its result back through a namespaced `SELECT` in the same transaction.
- Record upsert, Study Year creation/current selection, identifier creation, session upsert, and
  holiday creation follow this pattern.
- Empty session class scope is stored as `''`, matching the published non-null schema.
- The package declares `events.durable`, which is required by the transaction capability.

## Verification

- Strict Attendance production-database contract spec: 2/2 passed.
- Attendance package validation and activation harness: all checks passed.
- Published migration checksum remains unchanged.
- Backend production build passed (302 files).

## Remaining gate

This closes a local runtime-contract defect. Historical adoption, real PostgreSQL concurrency,
camera/USB device coverage, report parity, hosted lifecycle, backup/restore, rollback, entitlement,
and controlled-pilot evidence remain required before MP-3 can close.
