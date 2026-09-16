# MP2 Study Year Cutover Readiness and Rollback Drill — Local Evidence

Date: 2026-09-16
Status: partial MP2 implementation, not production cutover approval

This increment extends MP-2 Study Year controls with gate and rollback coverage:

- Academic cutover-readiness now includes Study Year parity and journal checks:
  - source/target Study Year fingerprint and count parity,
  - reconciled Study Year journal bound to the verified backup,
  - existing Department/Membership parity checks preserved.
- Study Year rollback drill script added:
  - requires explicit drill confirmation,
  - validates reconciled journal identity against backup and source fingerprint,
  - flips routing metadata to legacy and marks journal `rolled_back`,
  - preserves source and target datasets.

Local verification:

- `node --test scripts/academic-management-cutover-readiness.test.js` passed (3/3).
- `node --test scripts/academic-study-years-rollback-drill.test.js` passed (3/3).
- Regression checks passed:
  - `node --test scripts/academic-study-years-adopt.test.js` (3/3)
  - `node --test scripts/academic-study-years-adoption-preflight.test.js` (3/3)
- `npm.cmd run build` passed.

Not done in this increment:

- Restored-backup execution in a real hosted school lifecycle drill.
- Signed wave-level release approval for production cutover.
