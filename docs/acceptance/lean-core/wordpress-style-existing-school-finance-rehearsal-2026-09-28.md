# Existing-school Finance restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution and finance approval pending**

## Scope and result

This guarded synthetic gate exercises the Finance legacy boundary with representative fee record,
payment and settings rows. It uses an explicit exact-only conversion policy for USD with minor
exponent 2. It does not approve historical production currency assumptions or replace finance-owner
review.

The run passed verified backup, isolated restore, immutable plugin migrations, zero-write dry run,
adoption, exact reconciliation and non-destructive routing rollback. Source and target fingerprints
matched exactly:

`1e5acff75cee0f0e9489e31d301cf9afa1597fa96c17aac3bf3ea221165a276a`

Both legacy and plugin data remained intact. The production adapter now binds legacy temporal values
using native date parameters, and reconciliation normalizes PostgreSQL date objects to the canonical
source representation. The machine result is retained in
`wordpress-style-existing-school-finance-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now runs this PostgreSQL 16 gate and uploads its non-secret result. Remaining
work is the first remote artifact, approved hosted-backup execution, validation against each real
school's currency history, receipt/report browser parity, lifecycle validation, pilot evidence, and
formal finance-owner approval.
