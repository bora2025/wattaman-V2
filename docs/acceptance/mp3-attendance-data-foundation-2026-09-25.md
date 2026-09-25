# MP3 Attendance data foundation — 2026-09-25

Result: **local schema complete; real PostgreSQL migration drill pending**

Attendance Manager 0.1.4 adds immutable migration
`004_add_corrections_scans_alerts_snapshots` with:

- immutable correction history containing actor, reason and before/after JSON;
- a unique idempotency-key scan ledger containing only an identifier hash, input mode, actor,
  timestamps, outcome, record link and bounded metadata;
- absence-alert rule and delivery-state tables with retry/error/acknowledgement fields;
- person name/number, class name and Study Year label snapshots on attendance records;
- indexes for correction history, scan investigation and alert processing.

No published migration was edited. The package verifier confirms all four migration checksums.

## Verification

```text
npm test -- --runInBand src/plugins/attendance-manager-plugin-source.spec.ts
PASS: 4 tests

node packages/plugin-cli/bin/cli.js check plugins/wattanam.attendance-manager
ALL CHECKS PASSED
```

Docker is not running and no local `DATABASE_URL` is configured, so this evidence deliberately does
not mark MP3-003 complete. It becomes complete after applying all four migrations to real disposable
PostgreSQL, inspecting constraints/indexes, and exercising rollback-compatible install/update.
