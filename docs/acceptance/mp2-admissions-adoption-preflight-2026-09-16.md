# MP2 Admissions Adoption Preflight — Local Evidence

Date: 2026-09-16
Status: implemented (preflight only), no admissions write cutover

This increment adds a deterministic, read-only preflight for admissions migration readiness.

Implemented:

- `backend/scripts/academic-admissions-adoption-preflight.js`
- `backend/scripts/academic-admissions-adoption-preflight.test.js`
- `backend/package.json` scripts:
  - `db:academic-admissions:preflight`
  - `test:academic-admissions:preflight`

Preflight behavior:

- Metadata-only output with deterministic source fingerprint (`sha256`) and counts.
- Source scan covers legacy:
  - `ClassRegistration` rows (chunked by id)
  - `ClassRegistrationSettings` singleton
  - `ClassRegistrationField` rows (chunked by id)
- Validates source invariants and fails closed for invalid chunks/order/required fields.
- Adds blocker if settings hide both email and phone (admissions account creation impossible).
- Validates target namespaced tables are present and empty before adoption:
  - `plugin_wattanam_academic_management_class_registration`
  - `plugin_wattanam_academic_management_class_registration_settings`
  - `plugin_wattanam_academic_management_class_registration_field`

Validation status in this session:

- Static diagnostics report no errors in changed files.
- Terminal execution output remains unavailable, so command pass/fail capture for the new preflight test is pending.

Follow-up:

- Add admissions additive migrations for the target namespaced tables.
- Add admissions dry-run/adopt/reconcile and rollback-drill scripts.
- Replace workflow route stubs with certified plugin-owned submit/resolve handlers.
