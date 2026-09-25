# MP-7 Communication adoption toolkit — local acceptance evidence

Date: 2026-09-25

Status: local tooling accepted; restored-backup and hosted PostgreSQL execution remain open.

The two-dataset Message/Post path provides bounded read-only inspection, deterministic normalized
fingerprints, domain validation, verified school-bound backup enforcement, exact slug/fingerprint
confirmation, crash-resumable idempotent journals under a maintenance lock, source/target
reconciliation and routing-only rollback preserving both datasets. Reports contain counts and hashes
only: message/post bodies, names, photos and contact details are explicitly excluded.

```text
Communication adoption tests: 4 passed, 0 failed
Communication source/behavior tests: 8 passed, 0 failed
```

This does not prove restored-backup execution, production-shaped PostgreSQL, hosted cutover or
rollback-window approval.
