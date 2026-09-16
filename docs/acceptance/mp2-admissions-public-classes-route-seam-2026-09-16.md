# MP2 Admissions Read Route Seams — Local Evidence

Date: 2026-09-16
Status: partial MP2-003 implementation, not full admissions cutover

This increment starts MP2-003 by adding safe compatibility seams for admissions reads:

- Core `GET /class-registrations/public/classes` now supports optional plugin-owned routing via
  `ACADEMIC_CLASS_REGISTRATIONS_ROUTE_OWNER` (default: `legacy`).
- In plugin mode, the controller dispatches to Academic Management plugin route
  `GET admissions/public/classes`.
- Plugin backend now serves `admissions/public/classes` from namespaced class/study-year tables and
  enforces hidden-registration filtering plus price redaction when `showPrice=false`.
- Core `GET /class-registrations/public/form-config` now also supports plugin-owned routing with
  the same owner switch.
- In plugin mode, form configuration dispatches to `GET admissions/public/form-config`.
- Plugin form-config route is read-only and returns singleton settings (or deterministic defaults
  when missing) plus enabled custom fields ordered by `order`.
- Admin `GET /class-registrations/settings` and `GET /class-registrations/fields` now support the
  same optional plugin-owned routing with legacy default.
- In plugin mode, admin reads dispatch to `GET admissions/settings` and
  `GET admissions/fields`.
- In plugin mode, core `POST /class-registrations/public` and
  `PATCH /class-registrations/:id` dispatch through plugin workflow contracts
  (`POST admissions/public/submit`, `PATCH admissions/registrations/:id/resolve`).
- In plugin mode, settings/fields mutations also dispatch to the plugin
  (`PATCH admissions/settings`, `POST admissions/fields`, `PATCH admissions/fields/:id`,
  `POST admissions/fields/reorder`, `DELETE admissions/fields/:id`).

Implemented files:

- backend/src/class-registrations/class-registrations.controller.ts
- backend/src/class-registrations/class-registrations.module.ts
- backend/src/class-registrations/class-registrations.controller.spec.ts
- plugins/wattanam.academic-management/backend/index.js
- backend/scripts/academic-management-reference-plugin.test.js

Validation status in this session:

- Static diagnostics report no errors in changed files.
- Terminal execution channel did not return command output in this session, so command pass/fail
  capture remains pending.

Follow-up for MP2-003 completion:

- Certified plugin-owned submit/resolve/settings/fields handlers, migration tooling,
  cutover-readiness, and rollback drills are now tracked in
  [mp2-admissions-cutover-readiness-rollback-drill-2026-09-16.md](./mp2-admissions-cutover-readiness-rollback-drill-2026-09-16.md).
