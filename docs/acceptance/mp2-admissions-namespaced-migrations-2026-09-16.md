# MP2 Admissions Namespaced Migrations — Local Evidence

Date: 2026-09-16
Status: implemented, checksum-registered in plugin manifest, no live deployment

This increment adds the three additive namespaced migrations needed for plugin-owned admissions storage.

Implemented migrations:

- `plugins/wattanam.academic-management/migrations/006_create_class_registration.sql`
- `plugins/wattanam.academic-management/migrations/007_create_class_registration_settings.sql`
- `plugins/wattanam.academic-management/migrations/008_create_class_registration_field.sql`

Design notes:

- All three tables are additive (CREATE TABLE only) and namespaced under
  `plugin_wattanam_academic_management_*`.
- Schema mirrors legacy `ClassRegistration`, `ClassRegistrationSettings`, and
  `ClassRegistrationField` shapes so the preflight/adopt toolkits can produce exact fingerprints.
- Plugin manifest now registers all eight migrations (001..008) with computed SHA256 checksums.
- Reference plugin contract test validates migration count (8), additive-only syntax, and presence
  of expected columns.

Validation status in this session:

- Static diagnostics report no errors in changed files.
- Terminal execution output is unavailable, so runtime pass/fail capture is pending.

Follow-up:

- Install/activate plugin in a dev/sandbox database so migrations run against real tables.
- Run admissions preflight/adopt toolkit against the real target tables.
- Replace submit/resolve plugin stubs with certified namespaced write handlers.
