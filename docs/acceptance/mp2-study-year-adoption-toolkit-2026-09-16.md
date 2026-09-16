# MP2 Study Year Adoption Toolkit — Local Evidence

Date: 2026-09-16
Status: partial MP2 implementation, not production cutover

This increment adds backup-bound Study Year migration tooling for the Academic Management plugin:

- `academic-study-years-adopt.js` with:
  - strict non-interactive confirmation and fingerprint approval,
  - zero-write `--dry-run`,
  - resumable journaled backfill with maintenance lock,
  - post-copy unchanged-source verification,
  - exact source/target reconciliation on row count, current-year count and fingerprint,
  - fail-closed behavior when target is non-empty without a matching journal.
- npm scripts added for Study Year preflight/adopt/dry-run and tests.

Local verification:

- `node --test scripts/academic-study-years-adoption-preflight.test.js` passed (3/3).
- `node --test scripts/academic-study-years-adopt.test.js` passed (3/3).
- Regression checks also passed:
  - `npm test -- study-years.controller.spec.ts` (3/3)
  - `node --test scripts/academic-management-reference-plugin.test.js` (3/3)
- `npm run build` passed.

Not done in this increment:

- Restored-backup execution on a real school dataset.
- Hosted lifecycle/cutover drill.
- Rollback certification with signed release evidence.
