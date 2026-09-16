# MP-2 Academic Department Adoption Preflight

Date: 2026-09-15  
Status: local implementation and target package verified; live school execution not performed

## Scope

`backend/scripts/academic-management-adoption-preflight.js` is the read-only prerequisite for
moving legacy Department rows and `User.departmentId` memberships into Academic Management.

It reads both sources in stable ID order and emits only counts, blockers and a deterministic
SHA-256 fingerprint. Department names, descriptions and user IDs are not emitted. It exposes no
mutation method and does not create migrations, backups, journals, plugin records or target rows.

## Target contract

The initial `plugins/wattanam.academic-management` package now defines these additive target tables:

- `plugin_wattanam_academic_management_department`
- `plugin_wattanam_academic_management_user_department`

The preflight fails closed when either table is absent/non-empty, a membership references an
unknown department, source ordering is unstable, or the requested batch size is outside 1..1000.

## Verification

Command:

`npm.cmd run test:academic-management:preflight`

Result:

- tests: 3 passed
- failures: 0
- backend build: passed (284 files compiled)
- plugin contract tests: 3 passed
- plugin CLI compatibility check: all checks passed
- guarded adoption tests: 4 passed
- department compatibility/provider tests: 6 passed
- read-only cutover-readiness tests: 3 passed

Covered behavior:

- deterministic fingerprint across different valid batch sizes
- metadata-only report with no names or user IDs
- missing and non-empty target blockers
- orphaned membership blocker
- invalid chunk ordering and batch-size rejection
- exact school confirmation and verified school-bound backup
- zero-write dry-run with no journal/lock creation
- ordered department-before-membership copy
- separate backup-bound, resumable journals for both phases
- post-commit crash retry through idempotent inserts
- unchanged-source and exact count/fingerprint reconciliation
- stale fingerprint and pre-existing target rejection
- distinct membership-chunk idempotency keys derived from `userId`
- both resume journals and unmatched phase targets validated before any backfill write
- legacy-default `/departments` routing, permission-gated plugin reads and configuration rollback;
  plugin-mode writes and direct plugin mutation routes fail closed
- cutover check re-verifies exact source/target parity, both reconciled journals, backup integrity,
  active plugin status and absence of a maintenance lock; it never changes routing

## Remaining gate

This evidence does not authorize schema removal or production adoption. The package is not yet
signed or published. The backup-bound dry-run/copy/reconciliation toolkit is locally verified;
execute it against a restored backup before any controlled-school cutover.
The compatibility switch `ACADEMIC_DEPARTMENTS_ROUTE_OWNER` accepts only `legacy` (default) or
`plugin`. Local controller proof does not establish live cutover or rollback. Both source and
target tables remain intact.

Run `npm.cmd run db:academic-management:cutover-check` only on the restored-backup drill after
adoption. A passing report is not production authorization: account department assignment and
directory membership consumers have not yet switched to the plugin-owned membership table, so
live writes could diverge after the check. Keep the route owner at `legacy` until those runtime
contracts, a maintenance/dual-write policy and a controlled rollback drill are certified.
