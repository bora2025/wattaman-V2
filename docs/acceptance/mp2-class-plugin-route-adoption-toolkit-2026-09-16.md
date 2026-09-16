# MP2 Class Plugin Read Route and Adoption Toolkit — Local Evidence

Date: 2026-09-16
Status: partial MP2 implementation, not production cutover approval

This increment adds the first Class extraction foundation for Academic Management:

- Core `/classes` compatibility ownership now supports plugin-owned list reads via
  `ACADEMIC_CLASSES_ROUTE_OWNER` with legacy default.
- In plugin mode, class mutations fail closed to prevent split-brain writes before migration
  certification.
- Academic plugin package now includes read-only Class route and declarative Class list page.
- Additive namespaced Class migration added:
  `plugins/wattanam.academic-management/migrations/005_create_class.sql`.
- Class adoption toolkit added:
  - read-only preflight (`academic-classes-adoption-preflight.js`),
  - confirmation-gated dry-run and journaled adopt/reconcile (`academic-classes-adopt.js`),
  - focused script tests and npm command wiring.

Local verification:

- Static diagnostics report no errors across all touched files.
- Terminal execution output channel returned empty responses in this environment during this step,
  so command pass/fail evidence could not be captured here.

Remaining before cutover:

- Run the focused test commands with captured output in a healthy terminal session.
- Add Class parity into cutover-readiness and rollback drill workflows.
- Execute restored-backup hosted adoption and rollback evidence capture.
