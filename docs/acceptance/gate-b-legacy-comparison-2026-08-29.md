# Gate B — Legacy Before/After Comparison — 2026-08-29

## Note on this document's history

An earlier version of this document (same filename, same date) described a considerably more advanced implementation: Ed25519-signed reports, sealed-owner-password verification, an 85/85-check drill run across separate release-image processes. When this update was made, `backend/scripts/legacy-compare.js` did not actually exist on disk despite that description and the corresponding completion-checklist entry both being present — the tracking documents had gotten ahead of a real, committed artifact. This document now describes what is *actually implemented and verified* as of this commit. If the more advanced version described previously exists in another branch or was lost, it should replace what's here rather than this being treated as the final word on B-003's design.

## Implemented

`backend/scripts/legacy-compare.js` has two modes:

1. `--snapshot --out <file>`: enumerates every `public` base table via `information_schema`, and for each table fetches every row as JSON (`to_jsonb`, sorted by the JSON text representation for a stable order without needing per-table primary-key introspection), recording `{ rowCount, contentHash }` per table. Also enumerates every foreign key via `information_schema.table_constraints`/`key_column_usage`/`constraint_column_usage` and counts orphaned child rows for each. Also checks every `User.password` value is still bcrypt-shaped (`^\$2[aby]\$`) — proof the credential *mechanism* survived intact, not an actual login attempt (the plaintext password is never known to this tool).
2. `--compare <before.json> --after <after.json> --out <report.json>`: diffs two snapshots per table (row-count delta, content-hash change), flags any row-count *decrease* as unexplained loss, flags any post-adoption foreign-key orphan, and runs a small set of read-path workflow checks (a live `Attendance` query executes without error; counts of classes-with-students and total students, explicitly reported as "no data to exercise" when the fixture is sparse rather than silently passing). The final report includes a `reportSha256` self-hash of its own JSON.

This is deliberately simpler than the previously-described version: no Ed25519 signing, no sealed-credential-file verification. Both are real, reasonable extensions for later, not implemented here.

## Verification

- 7 unit tests (`legacy-compare.test.js`) cover the `compare()` diffing logic directly: identical snapshots produce zero diffs, a row-count decrease is flagged as loss, a content-hash change is flagged even when row counts match, a growing table is *not* flagged as loss, a table appearing only in one snapshot is handled, a foreign-key orphan appearing after adoption is surfaced, and a wrong-format snapshot is rejected.
- Live end-to-end drill, run in an isolated containerized environment (fresh `npm install`/`prisma generate` targeting Linux, never touching the shared host `node_modules`, on a disposable PostgreSQL 16 container):
  1. `create-synthetic-legacy-fixture.js` seeded the standard Angkor-School-shaped synthetic fixture (68 tables, one `SUPER_ADMIN` user row).
  2. `legacy-preflight.js --use-adopt-database-url` confirmed `legacy_unadopted` state and produced the schema fingerprint.
  3. `legacy-compare.js --snapshot` captured the before-state (68 tables, `User` row count 1).
  4. `legacy-adopt.js --use-adopt-database-url` ran for real against the fixture, using the preflight's fingerprint for confirmation.
  5. `legacy-compare.js --snapshot` captured the after-state.
  6. `legacy-compare.js --compare` diffed the two: **zero unexplained row loss**, the only tables with row-count or content changes were exactly the ones adoption is expected to touch (`Installation`, `AuditLog`, `SiteSetting`, the plugin registry tables, `_prisma_migrations`), zero foreign-key orphans, `User.password` still bcrypt-shaped. Process exited 0 — the code this tool reserves specifically for a clean, zero-loss comparison (a non-zero exit, `2`, is reserved for detected loss).

## Remaining acceptance evidence

Honest limitation, stated plainly: this was proven against the existing synthetic fixture, which is schema-rich but data-sparse (one seeded row) — this proves the tool's mechanics, not realistic multi-table row-count/relationship math against real data shapes. B-003 (and B-001/B-002) still need the two sanitized real legacy snapshots to close for real; that requires someone outside engineering to source them.
