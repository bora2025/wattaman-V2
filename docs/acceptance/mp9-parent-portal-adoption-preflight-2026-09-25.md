# MP9 Parent Portal adoption evidence — 2026-09-25

The Parent Portal migration toolkit maps legacy `ParentLinkRequest.studentId` through the legacy
Student relation to the stable directory `userId` required by the plugin-owned workflow table.

The read-only preflight:

- streams deterministically ordered source rows in bounded chunks;
- blocks missing Student directory identity, malformed email/status/timestamps, and inconsistent
  pending/resolved metadata;
- verifies the plugin table exists and is empty;
- emits only counts and hashes, excluding request notes, parent details, accounts, credentials,
  student profiles and guardian relationships.

The guarded adopter requires an exact school slug, approved source SHA-256 and verified school-bound
recovery backup. It supports crash-safe journal resume and idempotent inserts, proves the source did
not change during copying, and requires exact count/hash reconciliation. The rollback drill changes
routing metadata only and preserves both legacy and plugin datasets.

## Local verification

```text
tests 4
pass  4
fail  0
```

The tests cover invalid legacy provenance, zero-write dry-run, exact confirmation, simulated crash
resume, exact reconciliation, metadata-only rollback and source-change rejection. Real PostgreSQL
execution against a restored school backup remains required before cutover.

Parent Portal 0.1.1 also implements the adjacent relationship-safety gate. An existing guardian can
only be replaced or detached when an administrator supplies its exact current identifier. Rejected
replacement attempts perform no parent-account mutation. If guardian assignment succeeds but the
request status loses a concurrent update, the prior guardian (including `null`) is restored before
the command returns an error. Nine focused Parent Portal source/behavior tests cover normal approval,
unconfirmed replacement rejection, compensating restoration and compare-and-set detach.
