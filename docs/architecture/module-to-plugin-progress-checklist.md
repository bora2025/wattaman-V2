# Module-to-Plugin Migration Progress Checklist

Status: proposed execution tracker
Last updated: 2026-09-16
Source plan: [Wattanam Business Modules to Official Plugins Migration Plan](./module-to-plugin-migration-plan.md)

## 1. How to use

- Mark `[x]` only when evidence exists under `docs/acceptance/`.
- Mark `[~]` when coding is in progress but gate evidence is not complete.
- Keep one owner per item and one target date.
- Update this file at least once per week.

## 2. Program gates

- [x] MP-0 gate: ownership and data-classification inventory gate passes in CI (`architecture:inventory:gate`).
- [x] MP-1 gate: one low-risk plugin re-certified end to end from marketplace install to restore.
- [ ] MP-2 gate: Academic Management extracted with contract tests passing for dependents.
- [ ] MP-3 gate: Attendance Manager/Timetable/Examination/Learning extracted and device/report workflows certified.
- [ ] MP-4 gate: Finance/HR/Communication/Parent Portal extracted with privacy and authorization review.
- [ ] MP-5 gate: Reporting extracted; legacy business pages/routes/tables removed after support window.

## 3. Wave tracker

Planning note: target dates below are execution targets and should be re-baselined after each gate.

| Wave | Status | Owner | Target date | Evidence doc |
|---|---|---|---|---|
| MP-0 Platform prerequisites | [x] | Platform Architecture Lead | 2026-10-04 | `docs/acceptance/lean-core/mp0-platform-prerequisites-2026-09-15.md` |
| MP-1 Low-coupling proof | [x] | Platform Lead + Product Owner | 2026-10-25 | `docs/acceptance/` |
| MP-2 Academic foundation | [ ] | Academic Plugin Lead | 2026-12-06 | `docs/acceptance/` |
| MP-3 Academic dependants | [ ] | Attendance, Timetable, Exam, Learning Leads | 2027-02-28 | `docs/acceptance/` |
| MP-4 Sensitive domains | [ ] | Finance/HR/Communication Leads | 2027-04-30 | `docs/acceptance/` |
| MP-5 Aggregation and cleanup | [ ] | Platform Release Lead | 2027-06-15 | `docs/acceptance/` |

## 4. MP-0 execution checklist

- [x] Ownership manifest covers all discovered files/routes/models.
- [x] Data-classification manifest covers all models and outbound destinations.
- [x] Architecture inventory gate passes with zero ownership gaps.
- [x] UI v2 reference plugin lifecycle drill (install, enable, disable, update, remove, reinstall) documented.
- [x] API and worker artifact digest parity drill documented.
- [x] Core-only CI drill documented (clean install, no business pages/routes/modules).

MP-0 evidence:

- `docs/acceptance/lean-core/mp0-platform-prerequisites-2026-09-15.md`
- `docs/acceptance/lean-core/lc3-plugin-ui-v2.md`
- `docs/acceptance/lean-core/lc4-runtime-contracts.md`
- `docs/acceptance/lean-core/lc2-core-only-composition.md`

## 5. Per-plugin readiness checklist

Run this before extracting any plugin:

- [ ] Ownership worksheet completed (backend, frontend, mobile, jobs, realtime, notifications, reports, files).
- [ ] Contracts published for all cross-plugin dependencies.
- [ ] Migration preflight, dry-run, reconcile and rollback scripts implemented.
- [ ] Permission matrix includes route and row-scope checks.
- [ ] Fresh core-only install works without plugin.
- [ ] Marketplace installation works without rebuilding core frontend/API images.
- [ ] Disable/update/uninstall/reinstall behavior verified with data preservation.
- [ ] Backup/restore drill reproduces plugin data and files.

## 6. RAG status rules

Use these rules for each wave and for the weekly overall status:

- On track: no open blocker, and at least one planned acceptance item moved forward this week.
- At risk: target date is within 14 days and one or more planned acceptance items are still open.
- Blocked: a required dependency is unresolved for more than 5 working days, or no acceptance progress happened this week.

Date risk trigger by wave target:

- 30+ days remaining: normal watch.
- 15-29 days remaining: raise risk if evidence docs are still missing.
- 0-14 days remaining: default to At risk unless all gate checks are already evidenced.
- Past target date: default to Blocked until re-baselined with a new approved target date.

## 7. Weekly update log

### Week of 2026-09-16

- Overall status: [x] On track [ ] At risk [ ] Blocked
- Completed this week:
  - MP2 Study Years provider boundary implemented. A deterministic set-current command verifies
    the target, takes a transaction-scoped advisory lock, and changes flags atomically; 3/3 focused
    tests and TypeScript check pass.
  - MP1 Document Designer interim JSON authoring page added with separate edit permission,
    actual-descriptor/schema validation and invalid-JSON rejection. This does not complete the
    canvas/preview/generate/print vertical feature.
  - MP2 roster/enrollment contract v1 implemented behind Directory with deterministic current
    roster projection and school-timezone date validation. Historical lookup fails closed until
    enrollment intervals exist (22/22 focused tests; TypeScript check passes).
  - MP2 enrollment interval target and adoption added: additive namespaced migration, valid-range
    and single-open-membership constraints, verified-backup journaled copy, unchanged-source check
    and exact reconciliation pass 6/6 local tests plus plugin CLI validation. Live adoption and
    historical source completeness remain open.
  - MP2 enrollment read routing added: default legacy and opt-in plugin interval modes are
    reversible; plugin reads use repeatable-read isolation, reject overlaps, and require current
    legacy parity (25/25 combined Directory tests). Production enablement awaits restored-backup
    adoption and live parity evidence.
  - MP2 Study Year plugin read slice implemented: `/study-years` now supports explicit plugin-owned
    reads with legacy default, plugin-mode writes fail closed, and the Academic Management plugin
    package now includes read-only Study Year routes, declarative UI listing and additive namespaced
    migration plus a deterministic read-only adoption preflight (12/12 focused tests, backend build
    passed).
  - MP2 Study Year adoption toolkit added: strict confirmation-gated dry-run and journaled adoption
    now provide resumable copy/reconcile checks for namespaced StudyYear rows with unchanged-source
    verification and fail-closed target/journal rules (6/6 focused script tests, backend build
    passed).
  - MP2 Study Year cutover safety added: Academic cutover-readiness now enforces Study Year
    source/target parity and reconciled journal state, and a rollback drill script verifies
    legacy-route restoration without dataset deletion (6/6 focused script tests, backend build
    passed).
  - MP2 Class extraction foundation added: `/classes` now supports plugin-owned list reads with
    legacy default and plugin-mode write fail-close protection; Academic Management now includes
    read-only Class route/UI, additive namespaced Class migration, and class preflight/adoption
    scripts with focused tests wired in backend scripts.
  - MP2 Class cutover safety implementation added: Academic cutover-readiness now includes Class
    parity and Class journal reconciliation checks, and a Class rollback drill script restores
    legacy route ownership without deleting datasets.
  - MP2 Study Year certified write handlers added: plugin routes for POST/PUT/set-current/DELETE
    study-years are implemented, and core `/study-years` mutations dispatch to them in plugin mode.
    Controller specs and plugin reference test pass; backend build passes.
  - MP2 Class certified write handlers added: plugin routes for POST/PUT/DELETE classes and
    POST/PATCH/DELETE class-student management are implemented, and core `/classes` mutations
    dispatch to them in plugin mode. Bulk CSV import remains fail-closed pending certification.
    Controller specs and plugin reference test pass; backend build passes.
  - MP2-003 admissions boundary started: `class-registrations/public/classes` now supports optional
    plugin-owned routing with legacy default, and the Academic Management plugin exposes a
    read-only admissions public-classes route backed by namespaced class/study-year data with
    hidden-registration filtering and price redaction.
  - MP2-003 admissions read seam expanded: `class-registrations/public/form-config` now supports
    optional plugin-owned routing with legacy default, and the Academic Management plugin exposes a
    read-only admissions form-config route returning singleton settings/defaults and enabled custom
    fields in deterministic order.
  - MP2-003 admissions admin seam added: `class-registrations/settings` and
    `class-registrations/fields` now support optional plugin-owned reads with legacy default via
    read-only plugin routes (`admissions/settings`, `admissions/fields`), and plugin-mode
    settings/field mutations fail closed in core until consistency policy is certified.
  - MP2-003 admissions workflow guard added: legacy-owned write routes
    (`class-registrations/public`, `class-registrations/:id`) now also fail closed when plugin mode
    is enabled, preventing unsafe admissions writes prior to workflow-contract and cutover
    certification.
  - MP2-003 admissions workflow contracts seeded: plugin routes
    `POST admissions/public/submit` and `PATCH admissions/registrations/:id/resolve` are now
    registered for explicit contract discovery, but intentionally reject writes until migration and
    cutover certification completes.
  - MP2-003 workflow boundary integration advanced: in plugin mode, core
    `class-registrations/public` and `class-registrations/:id` now dispatch through those plugin
    contracts instead of executing legacy write services directly; mutation behavior remains
    certification-blocked by plugin stubs.
  - MP2-003 migration-toolkit start: deterministic read-only admissions preflight is now added for
    legacy `ClassRegistration`, `ClassRegistrationSettings` and `ClassRegistrationField`, including
    source fingerprinting and fail-closed readiness checks for the three planned namespaced
    admissions target tables.
  - MP2-003 migration-toolkit advanced: admissions dry-run/adopt now includes strict confirmation,
    verified-backup gating, journaled multi-phase resumable copy
    (registrations/settings/fields), and exact source/target fingerprint reconciliation while
    keeping legacy ownership unchanged.
  - MP2-003 namespaced storage added: additive migrations for
    `plugin_wattanam_academic_management_class_registration`,
    `_class_registration_settings`, and `_class_registration_field` are created and
    checksum-registered in the plugin manifest.
  - MP2-003 rollback safety added: admissions rollback drill script
    (`academic-admissions-rollback-drill.js`) and its test now exist, and npm scripts
    `db:academic-admissions:rollback-drill` / `test:academic-admissions:rollback-drill`
    are wired.
  - MP2-003 cutover readiness extended: academic-management cutover-readiness now includes
    admissions source/target parity checks (registrations/settings/fields), reconciled
    journal validation, and reports ready/not-ready while remaining read-only. Test fixtures
    and static diagnostics pass.
  - MP2-003 certified plugin-owned write handlers implemented: submit, resolve, settings update,
    and custom-field CRUD/reorder/delete now run against namespaced admissions tables. Core
    subscribes to the `academic.registration.approved.v1` plugin event to create the User and
    Student identity records and link them back to the namespaced registration. The plugin
    gained `crypto.hash` capability (bcrypt hashing via runtime) and `notifications.send` for
    email/in-app notifications. All touched scripts, Jest controller/spec/subscriber tests, and
    the backend build pass locally.
  - MP2-005 lifecycle event contracts completed: plugin StudyYear/Class/student-management write
    handlers publish versioned events (`academic.study-year.*.v1`, `academic.class.*.v1`,
    `academic.student.*.v1`) with entity snapshots and principal, and also persist the same events
    to the durable outbox via `tx.publish()` with deterministic idempotency keys. Plugin reference
    test, backend build, controller specs, and the new core `AcademicLifecycleSubscriber` spec pass.
  - MP2-006 Academic UI extension set completed locally: Study Years and Classes have full declarative
    list/create/detail/edit pages; Registrations have list/detail/resolve pages; Class Students has a
    roster list/add page; Teachers has a directory page. Navigation includes Departments, Study Years,
    Classes, Teachers, and Registrations. Plugin reference test, backend build, and controller/subscriber
    specs pass.
  - MP2-008 dependent contract consumption advanced: `AttendanceService` now routes membership for
    `recordAttendance`, `recordBulkAttendance`, `getStudentAttendanceRecords`, `getUserDailyAttendance`
    and `wattamanScan` through the roster/enrollment contract (`DirectoryService`), and the focused
    boundary spec passes 9/9. `FeesService.getStudents()` already uses `getEnrollmentAtDate()` with a
    passing boundary spec (2/2). Full backend Jest suite is 515 pass / 3 pre-existing unrelated fail.
- In progress:
  - MP2 Academic Management hosted lifecycle evidence and restored-backup cutover drills for
    StudyYear/Class/Admissions remain open.
  - MP1 Document Designer full-feature extraction and hosted certification remain open.
- Blockers:
  - No local coding blocker; full-program completion requires real restored-backup, hosted, device,
    security and release approvals for each migration wave.
- Next week:
  - Execute StudyYear restored-backup adoption and reconciliation drill, then run controlled
    rollback verification before any plugin-mode write cutover.
  - Extend the same toolkit pattern to classes/admissions ownership migration slices.
  - Add Study Year hosted lifecycle proof tied to plugin activation/deactivation evidence.
- Evidence added:
  - docs/acceptance/mp2-study-year-boundary-2026-09-16.md
  - docs/acceptance/mp1-document-designer-json-editor-2026-09-16.md
  - docs/acceptance/mp2-roster-enrollment-runtime-contract-2026-09-16.md
  - docs/acceptance/mp2-enrollment-interval-adoption-2026-09-16.md
  - docs/acceptance/mp2-enrollment-read-routing-2026-09-16.md
  - docs/acceptance/mp2-study-year-plugin-route-preflight-2026-09-16.md
  - docs/acceptance/mp2-study-year-adoption-toolkit-2026-09-16.md
  - docs/acceptance/mp2-study-year-cutover-readiness-rollback-drill-2026-09-16.md
  - docs/acceptance/mp2-class-plugin-route-adoption-toolkit-2026-09-16.md
  - docs/acceptance/mp2-class-cutover-readiness-rollback-drill-2026-09-16.md
  - docs/acceptance/mp2-admissions-public-classes-route-seam-2026-09-16.md
  - docs/acceptance/mp2-academic-ui-extension-set-2026-09-16.md

### Week of 2026-09-15

- Overall status: [x] On track [ ] At risk [ ] Blocked
- Completed this week:
  - MP-0 ownership and data-classification gaps closed in manifests.
  - Architecture inventory gate run and passing with zero ownership/data-classification gaps.
  - Progress checklist created and linked from the migration plan.
  - MP-0 acceptance evidence compiled from LC2, LC3 and LC4 and recorded.
  - MP-1 announcements recertification first pass executed and evidence draft recorded.
  - MP-1 announcements certification suite completed (adoption, lifecycle, recovery, security all pass).
  - MP-1 live restore drill completed with passing JSON evidence; MP1-BLK-001 resolved.
  - MP-1 API and worker digest parity capture completed with passing targeted tests.
  - MP-1 announcements clean-core marketplace install proof completed with targeted marketplace commerce tests.
  - MP-1 Document Designer first-pass certification completed for manifest, route contract and declarative UI wiring checks; this is not a full feature cutover.
  - MP-1 Document Designer host-render plugin UI test passed on desktop project via plugin descriptor routing.
  - MP-1 Document Designer lifecycle/data-preservation and print/export-scope checks completed with passing evidence.
  - MP-1 gate closed with announcements end-to-end recertification and Document Designer second-stream proof.
  - MP-2 kickoff baseline captured; architecture ownership gate and academic ownership anchors verified.
  - MP-2 initial roster/enrollment contract scaffold and dependent fixture tests added and passing.
  - MP-2 core boundary adapter milestone completed: Directory CLASS audience can delegate to academic provider with passing service tests.
  - MP-2 provider wiring milestone completed: Directory module now binds a concrete academic provider and classesForUser delegation path with passing tests.
  - MP-2 directory boundary expanded: provider delegation now also covers lookupClasses, with 14 passing directory service tests.
  - MP-2 dependent runtime proof added: targeted plugin runtime test confirms provider-backed class lookup and membership resolution path.
  - MP-2 first dependent service path integrated: scoring class-admin sheet scoping now uses directory contract membership resolution, validated by focused scoring tests (2 passed).
  - MP-2 second dependent service path integrated: attendance record and bulk-record entry points now enforce CLASS_ADMIN membership via directory contract resolution, validated by focused attendance tests (3 passed across targeted runs).
  - MP-2 third dependent service path integrated: exam student-list scoping now uses directory contract class memberships with global-exam fallback, validated by focused exam tests (2 passed).
  - MP-2 fourth dependent service path integrated: learning/courses student-list scoping now uses directory contract class memberships with enrollment fallback, validated by focused courses tests (3 passed).
  - MP2-001 identity split started: auth now exposes `ACADEMIC_IDENTITY_PROVIDER` seam for parent-link writes and academic delete bindings, validated by focused auth tests (7 passed across seam and core-distribution specs).
  - MP2-001 identity split advanced: non-core auth read-model enrichment now delegates through `ACADEMIC_IDENTITY_PROVIDER` for academic profile composition (`getUsers`, `getUserById`, `searchUsers`), validated by focused auth tests (11 passed across read-provider, seam, and core-distribution specs).
  - MP2-001 delete ownership advanced: core auth now sends a deterministic academic detach command
    before core deletion; the academic adapter owns its transaction, repeat execution is safe, and
    missing-provider execution fails closed (15 focused tests passed; backend build passed).
  - MP2-001 read ownership advanced: identity list/detail/search now select core fields only and
    require provider enrichment, with no academic relation-query fallback in auth (47/47 auth tests
    passed).
  - MP2-001 department ownership advanced: registration/update no longer directly mutate or select
    department fields; validated assignment/clearing commands use deterministic idempotency keys
    and provider enrichment (51/51 auth tests passed).
  - MP2-001 session ownership advanced: password login, refresh validation and refresh rotation
    now use one core-only user projection in every distribution (53/53 auth tests passed).
  - MP2-001 parent-link ownership advanced: assignment/clearing now uses a validated deterministic
    provider command with no auth-owned Student/User fallback (56/56 auth tests passed).
  - MP2-001/MP2-004 department lookup advanced: Session Configuration now resolves organization
    membership through the academic directory provider and never reads `User.departmentId`
    directly (16/16 focused tests passed; backend build passed).
  - MP2-002 department ownership advanced: all Departments CRUD now crosses an Academic Management
    provider; the legacy adapter owns atomic user unassignment/deletion with a deterministic command
    key (3/3 focused tests passed; backend build passed).
  - MP2-007 migration safety started: read-only department/membership preflight produces a
    deterministic metadata-only fingerprint and blocks orphaned references or unsafe target state
    (3/3 tests passed; no live database execution).
  - MP2-002/MP2-006 initial plugin package created: additive namespaced Department/membership
    migrations, view/manage permissions, read-only list route and department declarative UI pass 3/3
    contract tests and the plugin CLI check. It is not signed or published.
  - MP2-007 adoption advanced: verified-backup zero-write dry-run and separate journaled department/
    membership backfills resume after a simulated post-commit crash and exactly reconcile counts
    and fingerprint (3/3 adoption tests passed; legacy source remains untouched).
  - MP2-007 compatibility ownership advanced: `/departments` defaults to legacy, explicitly routes
    Department reads through the Academic Management permission gate in plugin mode, and can
    switch back to legacy without deleting either dataset. Plugin-mode writes now fail closed until
    consistency is certified (6 focused department tests passed).
  - MP2-002 split-brain prevention: direct plugin mutation routes and UI actions are withheld;
    `/departments` create/update/delete reject plugin owner mode. Legacy remains the only writer.
  - MP2-007 adoption retry hardened: membership chunks now use distinct `userId`-derived
    idempotency keys; both journals and phase target states are checked before any resume writes
    (10/10 combined Academic Management tests passed).
  - MP2-007 read-only cutover check added: it rechecks source/target fingerprints, both reconciled
    backup-bound journals, plugin activation and maintenance-lock absence without changing data or
    routing (13/13 combined Academic Management script tests passed).
  - MP2-001 assignment consistency advanced: an opt-in, default-off shadow command locks the user,
    rejects preexisting membership divergence, and atomically updates legacy `User.departmentId`
    and the namespaced plugin membership (or clears both). The auth suite passes 59/59 tests and
    backend compiles. This is not a production cutover: Department CRUD remains legacy-only and
    restored-backup adoption/rollback certification is still required.
  - MP2-001/MP2-004 directory read consistency advanced: opt-in plugin membership reads verify
    source/target parity under a user lock and reject divergence; default remains legacy. The
    directory/session focused suite passes 19/19 tests. Remaining auth enrichment and Department
    mutation ownership still prevent a production plugin cutover.
  - MP2-001 auth enrichment consistency advanced: plugin-read mode checks batch legacy/plugin
    Department membership parity under user locks before profile enrichment, and fails closed on
    mismatch (19/19 focused auth tests; TypeScript check passes). Legacy Department details remain
    in the profile response; this is not complete schema extraction.
- In progress:
  - Document Designer complete-feature extraction: legacy adoption, rich canvas UI, generation/print, scoped assets and hosted lifecycle remain open.
  - Document Designer adoption now has a read-only preflight, backup-bound zero-write dry-run and
    guarded journaled copy/reconciliation (8/8 focused data tests); real restore proof, rendered comparison,
    hosted adoption and live rollback certification remain open.
  - Document Designer compatibility routing implemented with legacy default, explicit plugin
    cutover and configuration rollback (3/3 controller tests); hosted cutover remains open.
  - Document Designer adoption now preserves an explicit four-permission grant matrix after
    reconciliation; generation/printing actions and row-scope proof remain open.
  - MP2-001 identity split implementation (next: bind identity contracts through the installed
    Academic Management runtime and address the remaining mixed User schema fields).
  - MP2-002 schema extraction (next: extend the package to academic profiles/classes/enrollment;
    physical `User.departmentId` remains unchanged until adoption certification).
  - MP2-007 migration toolkit (next: run preflight/dry-run/adoption and reversible compatibility
    switch against a restored backup; source deletion remains prohibited).
  - Department plugin runtime consistency (next: migrate assignment and membership readers to the
    plugin namespace, then certify a maintenance/dual-write policy; parity alone does not allow
    production cutover).
  - MP2-004 runtime roster/enrollment contract adapter wiring and broader dependent integration tests beyond current runtime, scoring, attendance, exam, and courses slices.
- Blockers:
  - None open.
- Next week:
  - Execute MP-2 checklist items MP2-001 through MP2-004 with contract test evidence.
  - Decide named owners (people or squads) for each wave and update section 3.
  - Re-baseline target milestones for MP-2 through MP-5 after MP-1 closeout.
- Evidence added:
  - docs/architecture/ownership-manifest.json
  - docs/architecture/data-classification.json
  - docs/architecture/module-to-plugin-progress-checklist.md
  - docs/architecture/mp1-low-coupling-proof-checklist.md
  - docs/acceptance/lean-core/mp0-platform-prerequisites-2026-09-15.md
  - docs/acceptance/mp1-announcements-recertification-2026-09-15.md
  - docs/acceptance/mp1-announcements-certification-report-2026-09-15.json
  - docs/acceptance/mp1-announcements-restore-drill-2026-09-15.md
  - docs/acceptance/mp1-announcements-restore-drill-2026-09-15.json
  - docs/acceptance/mp1-announcements-digest-parity-2026-09-15.md
  - docs/acceptance/mp1-announcements-clean-core-marketplace-install-2026-09-15.md
  - docs/acceptance/mp1-low-coupling-proof-summary-2026-09-15.md
  - docs/acceptance/mp1-document-designer-certification-2026-09-15.md
  - docs/acceptance/mp1-document-designer-adoption-preflight-2026-09-15.md
  - docs/architecture/mp2-academic-foundation-checklist.md
  - docs/acceptance/mp2-academic-foundation-baseline-2026-09-15.md
  - docs/architecture/mp2-identity-split-worksheet.md
  - docs/acceptance/mp2-academic-contracts-2026-09-15.md
  - docs/acceptance/mp2-academic-department-preflight-2026-09-15.md

### Week of 2026-09-21 — MP-3 Attendance Manager kickoff

- Overall status: [x] On track [ ] At risk [ ] Blocked
- Completed locally:
  - Created official package source `plugins/wattanam.attendance-manager` version `0.1.0`.
  - Consolidated target ownership for Study Years and student, teacher, and staff attendance under
    Attendance Manager; Academic Management and Human Resources become contract consumers.
  - Added additive namespaced storage for Study Years, sessions, holidays, scan identifiers, and a
    unified person-attendance record with camera, USB, and manual provenance.
  - Added permission-gated record, scanner, summary-report, and Study Year routes plus declarative
    UI for recent attendance, camera/keyboard-wedge scanning, print/CSV/PDF reports, and Study Years.
  - Plugin CLI validation/activation, UI-v2 schema tests, and backend build pass.
- In progress:
  - Legacy preflight/adoption/reconciliation and compatibility route dispatch.
  - Full behavior parity for corrections, sessions, holidays, alerts, realtime, absence rules, and
    detailed student/staff reports.
- Publication blocker:
  - The package must not be published as Stable until restored-backup adoption, rollback, real
    camera/USB device, report-parity, entitlement, and hosted lifecycle gates pass.
  - Live marketplace publication additionally requires a current platform admin bearer token.

## 8. Weekly update template

Copy and fill this block each week:

```md
### Week of YYYY-MM-DD
- Overall status: [ ] On track [ ] At risk [ ] Blocked
- Completed this week:
  - 
- In progress:
  - 
- Blockers:
  - 
- Next week:
  - 
- Evidence added:
  - docs/acceptance/...
```
