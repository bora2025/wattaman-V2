# MP-7 Transportation adoption toolkit — local acceptance evidence

Date: 2026-09-25

Status: local tooling accepted; restored-backup and hosted PostgreSQL execution remain open.

The Transportation adoption path provides a bounded read-only preflight, deterministic per-dataset
and aggregate SHA-256 fingerprints, relationship and domain validation, exact school/fingerprint
confirmation, a required verified school-bound recovery backup, crash-resumable idempotent journals,
a maintenance lock, exact source/target reconciliation and a routing-only rollback drill that
preserves both datasets.

Legacy Transportation has no rider-assignment model. The fifth source dataset is deliberately
fingerprinted as empty; rider assignments are created after cutover through the roster-validated
plugin API rather than inferred unsafely from legacy data.

```text
Transportation adoption tests: 4 passed, 0 failed
Transportation source/behavior tests: 11 passed, 0 failed
Backend build: 311 files compiled
Architecture ownership gate: 1,474 items owned; 83 models classified
```

This evidence does not claim a production migration. Completion still requires a restored recovery
backup, real PostgreSQL preflight/dry-run/adoption/reconciliation/rollback output, hosted routing
cutover and rollback-window approval.
