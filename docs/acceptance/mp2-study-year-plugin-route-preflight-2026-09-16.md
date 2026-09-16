# MP2 Study Year Plugin Read Route and Preflight — Local Evidence

Date: 2026-09-16
Status: partial MP2 implementation, not production cutover

This increment adds the first read-only Study Year plugin vertical required by MP-2:

- Core `/study-years` compatibility routing now supports explicit plugin-owned reads through
  `ACADEMIC_STUDY_YEARS_ROUTE_OWNER` with legacy default.
- Mutations (`create`, `update`, `set-current`, `delete`) fail closed when route owner is plugin,
  preventing split-brain writes before migration/cutover certification.
- `plugins/wattanam.academic-management` now registers read routes for:
  - `GET study-years`
  - `GET study-years/current`
- Plugin package adds additive namespaced Study Year storage migration:
  `004_create_study_year.sql`.
- Study Year declarative UI page is added for read-only listing in the plugin host.
- A dedicated read-only preflight script validates deterministic source ordering, single-current
  source invariant, target-table readiness, and emits only metadata + fingerprint.

Local verification:

- `npm test -- study-years.controller.spec.ts` passed (3/3).
- `npm test -- academic-study-years.provider.spec.ts` passed (3/3).
- `node --test scripts/academic-management-reference-plugin.test.js` passed (3/3).
- `node --test scripts/academic-study-years-adoption-preflight.test.js` passed (3/3).
- `npm run build` passed.

Not done in this increment:

- Restored-backup execution of Study Year adoption.
- Live rollback drill and hosted lifecycle proof.
- Production plugin-mode write ownership cutover.
