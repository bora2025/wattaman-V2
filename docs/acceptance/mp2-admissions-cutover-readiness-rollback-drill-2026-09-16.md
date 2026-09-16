# MP2 Admissions Cutover Readiness and Rollback Drill — Local Evidence

Date: 2026-09-16
Status: partial MP2-003 implementation, pending executable test capture

This increment extends admissions migration safety controls:

- Academic cutover-readiness now includes admissions source/target parity
  (registrations, settings singleton, custom fields) and reconciled adoption journal checks.
- Admissions rollback drill script added with explicit confirmation requirements and
  read-only journal verification.
- Rollback drill validates reconciled backup-bound admissions journal identity and then
  restores compatibility route ownership to legacy without deleting data.

Implemented files:

- backend/scripts/academic-admissions-rollback-drill.js
- backend/scripts/academic-admissions-rollback-drill.test.js
- backend/scripts/academic-management-cutover-readiness.js
- backend/scripts/academic-management-cutover-readiness.test.js
- backend/src/class-registrations/class-registrations.controller.ts
- backend/src/class-registrations/class-registration-approved-subscriber.service.ts
- backend/src/class-registrations/class-registration-approved-subscriber.service.spec.ts
- backend/src/plugins/plugin-sdk.ts
- backend/src/plugins/plugin-manifest.ts
- backend/src/plugins/plugin-runtime.service.ts
- plugins/wattanam.academic-management/backend/index.js
- plugins/wattanam.academic-management/plugin.json
- backend/package.json (new admissions rollback commands)

Validation status in this session:

- Static editor diagnostics report no errors in touched files.
- Focused command proofs executed successfully:
  - `node --test scripts/academic-admissions-rollback-drill.test.js` — passed (exit 0)
  - `node --test scripts/academic-management-cutover-readiness.test.js` — passed (exit 0)
  - `node --test scripts/academic-admissions-adoption-preflight.test.js` — passed (exit 0)
  - `node --test scripts/academic-admissions-adopt.test.js` — passed (exit 0)
  - `node --test scripts/academic-management-reference-plugin.test.js` — passed (exit 0)
  - `node node_modules/jest/bin/jest.js --runInBand src/class-registrations/class-registrations.controller.spec.ts` — passed, 1 suite / 6 tests (exit 0)
  - `node node_modules/jest/bin/jest.js --runInBand --testPathPattern=class-registration-approved-subscriber.service.spec.ts` — passed, 1 suite / 2 tests (exit 0)
  - `node node_modules/jest/bin/jest.js --runInBand src/plugins/plugin-sdk-contract.spec.ts src/plugins/plugin-runtime.service.spec.ts src/plugins/plugin-extensions.service.spec.ts src/plugins/reference-plugin.spec.ts` — passed, 4 suites / 34 tests (exit 0)
  - `npm.cmd run build` — passed (exit 0)
  - `npm.cmd test` — passed, 21 suites / 142 tests (exit 0)

Required follow-up evidence:

- No further re-run required for this increment.
- Next: hosted production-shaped cutover evidence for admissions; continue with StudyYear/Class
  certified write handlers and full end-to-end lifecycle evidence.
