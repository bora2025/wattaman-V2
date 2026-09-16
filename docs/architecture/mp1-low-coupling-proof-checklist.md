# MP-1 Low-Coupling Proof Checklist

Status: in progress
Created: 2026-09-15
Parent tracker: [Module-to-Plugin Migration Progress Checklist](./module-to-plugin-progress-checklist.md)
Source plan wave: [Module-to-Plugin Migration Plan, section 12 MP-1](./module-to-plugin-migration-plan.md)

## Objective

Prove one low-coupling plugin can be certified end to end on clean core without rebuilding core frontend or API images.

## Candidate scope for MP-1

- Re-certify existing official announcements plugin lifecycle and backup/restore behavior.
- Certify document-designer plugin package and runtime behavior as the second low-coupling proof.

## Exit criteria

- [x] Plugin installs from marketplace on clean core.
- [x] Enable, disable, update, remove and reinstall all pass.
- [x] No core rebuild/redeploy is required for plugin UI pages or plugin API routes.
- [x] API and worker both load the same artifact digest after restart.
- [x] Backup and restore preserve plugin data and files.
- [x] Permission and row-scope checks are verified for all plugin routes.
- [x] Evidence is stored under docs/acceptance.

## Work checklist

### A. Announcements re-certification

- [x] Verify plugin package signature and digest.
- [x] Install on clean core and validate route and navigation discovery.
- [x] Run lifecycle: disable, enable, update, remove, reinstall.
- [x] Run backup and clean restore drill with plugin present.
- [x] Confirm compatibility proxy behavior during legacy window.
- [x] Capture evidence file.
- [x] MP1-BLK-001 resolved: restore drill completed after Docker daemon and PostgreSQL tools became available.

### B. Document Designer certification

- [x] Validate manifest, permissions and navigation entries.
- [x] Validate template CRUD routes and active-template behavior.
- [x] Validate plugin UI pages render via host without rebuild.
- [x] Validate file/export/print behavior if configured.
- [x] Validate lifecycle and data preservation on disable/remove/reinstall.
- [x] Capture evidence file.

### C. Shared verification

- [x] Record exact commands and pass/fail outputs.
- [x] Record artifact digest seen by API and worker roles.
- [x] Record any blocker and owner with target resolution date.

## Evidence targets

- docs/acceptance/mp1-announcements-recertification-2026-09-15.md
- docs/acceptance/mp1-announcements-certification-report-2026-09-15.json
- docs/acceptance/mp1-announcements-restore-drill-2026-09-15.md
- docs/acceptance/mp1-announcements-restore-drill-2026-09-15.json
- docs/acceptance/mp1-announcements-digest-parity-2026-09-15.md
- docs/acceptance/mp1-announcements-clean-core-marketplace-install-2026-09-15.md
- docs/acceptance/mp1-document-designer-certification-2026-09-15.md
- docs/acceptance/mp1-low-coupling-proof-summary-2026-09-15.md
- docs/acceptance/mp1-low-coupling-proof-summary-YYYY-MM-DD.md
