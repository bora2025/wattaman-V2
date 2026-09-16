# MP-2 Academic Foundation Checklist

Status: in progress
Created: 2026-09-15
Parent tracker: [Module-to-Plugin Migration Progress Checklist](./module-to-plugin-progress-checklist.md)
Source plan wave: [Module-to-Plugin Migration Plan, section 12 MP-2](./module-to-plugin-migration-plan.md)

## Objective

Extract Academic Management so core identity and accounts can run without academic data tables/routes, while dependent plugins consume only published academic contracts.

## Scope for MP-2

- Separate core account identity from academic student and enrollment profiles.
- Extract classes, study years, departments, admissions and enrollment into `wattanam.academic-management` ownership.
- Publish roster/enrollment contracts for dependent plugins.

## Exit criteria

- [ ] Core-only accounts and authentication operate with Academic Management absent.
- [ ] Academic schema ownership is complete for Student, Class, ClassRegistration, StudyYear and Department.
- [ ] Admissions and enrollment workflows operate through the plugin boundary.
- [ ] Roster and enrollment contracts are versioned and consumed by dependents without cross-plugin SQL.
- [ ] Academic lifecycle events are published with outbox/idempotent delivery guarantees.
- [ ] UI routes for students/classes/years/registrations render from plugin extensions without core rebuild.
- [ ] Lifecycle drill passes: install, activate, disable, update, remove and reinstall.
- [ ] Backup and restore drill reproduces data, files and grants.
- [ ] Evidence is stored under `docs/acceptance/`.

## Work checklist

### A. Boundary and ownership

- [~] MP2-001 Split identity: separate account/person from student, teacher and employee domain profiles.
- 2026-09-15 progress: baseline coupling worksheet created in `docs/architecture/mp2-identity-split-worksheet.md`.
- 2026-09-15 progress: auth provider seam added (`ACADEMIC_IDENTITY_PROVIDER`) with Prisma adapter; `setStudentParent` and legacy academic delete bindings now delegate through the seam when configured, with focused auth tests passing (7/7 across seam + core-distribution specs).
- 2026-09-15 progress: auth non-core read-model enrichment (`getUsers`, `getUserById`, `searchUsers`) now supports provider-based academic profile composition through the same seam, with focused auth tests passing (11/11 across read-provider + seam + core-distribution specs).
- 2026-09-15 progress: user deletion no longer receives a core-owned transaction or falls back to
  direct academic Prisma writes. `AuthService` sends a deterministic, repeat-safe detach command;
  the legacy academic adapter owns its transaction and fails closed when unavailable. Focused auth
  and adapter tests pass (15/15), and the backend compiles.
- 2026-09-15 progress: `getUsers`, `getUserById` and `searchUsers` no longer contain legacy
  academic relation-select fallbacks. They select core identity fields only and fail closed when
  Academic Management enrichment is unavailable; the complete auth suite passes (47/47).
- 2026-09-15 progress: account registration/update no longer writes or selects department fields
  directly. Department assignment/clearing uses a validated command with a deterministic
  idempotency key, and update responses are provider-enriched (51/51 auth tests pass).
- 2026-09-15 progress: password login, refresh validation and refresh rotation now always use the
  same core-only authentication projection in every distribution; academic relations cannot enter
  authentication session payloads (53/53 auth tests pass).
- 2026-09-15 progress: parent assignment/clearing no longer has a direct Student/User Prisma
  fallback in auth. A validated provider command uses a deterministic idempotency key and owns
  student/parent existence and role checks (56/56 auth tests pass).
- 2026-09-15 progress: organization/department membership lookup is published through the academic
  directory boundary. Session Configuration no longer reads `User.departmentId` directly and fails
  closed when the provider contract is unavailable (16/16 focused tests pass).
- 2026-09-15 progress: an opt-in `ACADEMIC_DEPARTMENT_SHADOW_WRITE=true` assignment command locks
  the user row, checks existing legacy/plugin membership parity, and updates both stores in one
  transaction. Clearing deletes the plugin membership in that transaction. Mismatch or missing
  target Department fails before either write; the default remains legacy-only. The auth suite
  passes 59/59 tests. Do not enable shadow writes on a school until adoption, restored-backup
  reconciliation, and the remaining Department mutation/read consistency policy are certified.
- 2026-09-15 progress: `ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER=plugin` opt-in makes the academic
  directory resolve a user's Department from the namespaced membership table. It first locks and
  compares the legacy value in the same transaction; divergence fails closed. Default reads remain
  legacy. Directory/session focused tests pass 19/19 and backend compiles. This does not enable
  production cutover or replace the legacy auth profile read model.
- 2026-09-15 progress: auth academic profile enrichment now uses the same opt-in read setting to
  lock and compare a batch of legacy/plugin memberships before returning any profile rows.
  Divergence fails before the profile query; legacy is still the default. The response continues
  to use legacy Department details, so this is a parity guard, not completed plugin schema
  ownership (19/19 focused auth tests and TypeScript check pass).
- [~] MP2-002 Academic schema ownership finalized and validated in ownership/data-classification manifests.
- 2026-09-15 progress: Departments list/create/update/delete are behind an Academic Management
  provider. The controller-facing service has no Prisma dependency; the legacy adapter atomically
  unassigns users and deletes with a deterministic command key (3/3 focused tests pass).
- 2026-09-15 progress: a metadata-only, paginated adoption preflight fingerprints legacy
  departments and memberships, detects orphaned references, and requires two empty namespaced
  target tables. Local read-only guarantees pass 3/3 tests; live execution remains open.
- 2026-09-15 progress: initial `wattanam.academic-management` package created with two additive
  namespaced migrations matching the preflight contract, granular view/manage permissions,
  read-only department list route and declarative UI. Plugin contract tests and CLI check pass; the
  package is not signed/published and the remaining academic schema is open.
- 2026-09-16 progress: Study Years now crosses an Academic Management provider boundary. The
  legacy adapter owns StudyYear Prisma access; set-current verifies target existence and serializes
  concurrent commands under a transaction-scoped advisory lock (3/3 focused tests; TypeScript
  check). Namespaced data, plugin UI/routes and adoption remain open
  ([local evidence](../acceptance/mp2-study-year-boundary-2026-09-16.md)).
- 2026-09-16 progress: certified StudyYear and Class write handlers are implemented in
  `plugins/wattanam.academic-management/backend/index.js` (POST/PUT/set-current/DELETE for StudyYear;
  POST/PUT/DELETE for Class). Core `StudyYearsController` and `ClassesController` mutations now
  dispatch to these plugin routes when the corresponding `ACADEMIC_*_ROUTE_OWNER=plugin` switch is
  set, while bulk CSV import remains fail-closed pending certification. Controller specs and the
  plugin reference test are updated and pass; backend build passes.
- [ ] Inventory all academic routes/pages and map each to core or academic plugin owner.
- 2026-09-16 progress: Class read/write route ownership is wired end-to-end. Core `/classes`
  compatibility routing supports plugin-owned list reads and certified writes (create/update/delete
  and student-management mutations dispatch to the plugin), with legacy default and fail-closed
  guards for uncertified operations. Plugin Class write handlers perform core `Student`/`User`
  table writes for add/update/remove/cleanup. Controller specs and plugin reference test pass
  ([local evidence](../acceptance/mp2-class-plugin-route-adoption-toolkit-2026-09-16.md)).
- 2026-09-16 progress: `/classes` now has explicit compatibility ownership (`legacy` default;
  optional plugin-owned list reads) with plugin-mode write fail-close guards in core. Initial
  read-only plugin Class route and declarative Class list page are added in
  `plugins/wattanam.academic-management` ([local evidence](../acceptance/mp2-class-plugin-route-adoption-toolkit-2026-09-16.md)).

### B. Contracts and runtime

- [ ] MP2-003 Admissions and class-registration workflows moved behind plugin contracts.
- 2026-09-16 progress: admissions public-class discovery now has an explicit compatibility seam.
  Core `class-registrations/public/classes` can route to Academic Management plugin mode with
  legacy default, and plugin route `admissions/public/classes` serves namespaced class data with
  hidden-registration filtering and price redaction. Admissions write workflows remain legacy in
  this step ([local evidence](../acceptance/mp2-admissions-public-classes-route-seam-2026-09-16.md)).
- 2026-09-16 progress: admissions public form configuration now follows the same compatibility seam.
  Core `class-registrations/public/form-config` can route to plugin mode with legacy default, and
  plugin route `admissions/public/form-config` returns read-only singleton settings/defaults plus
  enabled custom fields in deterministic order. Admissions mutations and resolve flow are still
  legacy in this step ([local evidence](../acceptance/mp2-admissions-public-classes-route-seam-2026-09-16.md)).
- 2026-09-16 progress: admissions admin reads now follow plugin-compatible ownership too.
  Core `class-registrations/settings` and `class-registrations/fields` can route to plugin mode
  with legacy default via read-only plugin routes (`admissions/settings`, `admissions/fields`),
  while plugin-mode settings/field mutations now fail closed in core pending certified consistency
  policy. Public submit and admin resolve still remain legacy in this step
  ([local evidence](../acceptance/mp2-admissions-public-classes-route-seam-2026-09-16.md)).
- 2026-09-16 progress: admissions workflow writes are now guarded against unsafe plugin-mode
  execution. Core `class-registrations/public` and `class-registrations/:id` continue to use
  legacy logic, but both now fail closed when plugin owner mode is enabled, ensuring plugin mode is
  read-only until workflow contracts and migration readiness are certified
  ([local evidence](../acceptance/mp2-admissions-public-classes-route-seam-2026-09-16.md)).
- 2026-09-16 progress: Academic Management now registers admissions workflow contract stubs
  (`admissions/public/submit`, `admissions/registrations/:id/resolve`) behind plugin permissions.
  The stubs intentionally reject writes until migration and cutover certification is complete,
  providing explicit plugin contract inventory without enabling mutation cutover yet
  ([local evidence](../acceptance/mp2-admissions-public-classes-route-seam-2026-09-16.md)).
- 2026-09-16 progress: class-registration workflow endpoints now cross the plugin boundary in
  plugin mode. Core `class-registrations/public` and `class-registrations/:id` dispatch to plugin
  contracts rather than invoking legacy write services directly, but plugin handlers remain
  intentionally certification-blocked until namespaced admissions write adoption is implemented
  ([local evidence](../acceptance/mp2-admissions-public-classes-route-seam-2026-09-16.md)).
- 2026-09-16 progress: deterministic admissions migration preflight is now implemented for
  `ClassRegistration`, `ClassRegistrationSettings` and `ClassRegistrationField`, with metadata-only
  source fingerprinting and fail-closed target-table readiness checks for the three planned
  namespaced admissions tables ([local evidence](../acceptance/mp2-admissions-adoption-preflight-2026-09-16.md)).
- 2026-09-16 progress: admissions dry-run/adopt toolkit is now implemented with verified-backup
  gating, journaled multi-phase resumable copy (registrations/settings/fields), and exact
  source/target fingerprint reconciliation. Legacy admissions rows and route ownership remain
  unchanged in this step ([local evidence](../acceptance/mp2-admissions-adoption-toolkit-2026-09-16.md)).
- 2026-09-16 progress: additive namespaced admissions migrations are now created and
  checksum-registered in the plugin manifest for `ClassRegistration`, `ClassRegistrationSettings`
  and `ClassRegistrationField`, matching the preflight/adopt toolkit target tables
  ([local evidence](../acceptance/mp2-admissions-namespaced-migrations-2026-09-16.md)).
- 2026-09-16 progress: admissions rollback drill script and test are added, mirroring the
  study-year/class pattern, and npm scripts are wired for `db:academic-admissions:rollback-drill`
  and `test:academic-admissions:rollback-drill`.
- 2026-09-16 progress: academic-management cutover-readiness now validates admissions
  source/target parity for registrations/settings/fields, checks reconciled adoption journals,
  active plugin, and no maintenance lock, and remains read-only. Its unit-test fixtures were
  extended and static diagnostics pass.
- 2026-09-16 progress: certified plugin-owned admissions write handlers are implemented and
  tested. The plugin now serves submit, resolve, settings update, and custom-field CRUD/reorder
  against namespaced admissions tables. Core subscribes to `academic.registration.approved.v1`
  and creates the linked User/Student identity records. The plugin runtime gained the
  `crypto.hash` capability for bcrypt hashing without bundling dependencies. Backend build,
  controller spec, subscriber spec, and plugin reference test pass locally
  ([local evidence](../acceptance/mp2-admissions-cutover-readiness-rollback-drill-2026-09-16.md)).
- [ ] MP2-004 Publish roster contracts: class roster, enrollment-at-date, audience resolution.
- 2026-09-15 progress: initial versioned contract scaffold and tests added (`backend/scripts/mp2-academic-contracts-scaffold.js`, `backend/scripts/mp2-academic-contracts-scaffold.test.js`).
- 2026-09-15 progress: `DirectoryService` now supports optional CLASS-audience delegation through an academic provider boundary (`ACADEMIC_DIRECTORY_PROVIDER`).
- 2026-09-15 progress: concrete `PrismaAcademicDirectoryProvider` is wired in `DirectoryModule`; delegation now covers CLASS audience, `classesForUser` (including CLASS_ADMIN), and `lookupClasses`, with 14 passing directory tests.
- 2026-09-15 progress: the same provider now publishes `departmentForUser`; the first dependent
  consumer (`SessionConfigService`) uses the contract instead of direct User schema access.
- 2026-09-16 progress: Directory now exposes typed runtime roster/enrollment contract v1 with
  deterministic student projections and school-timezone date validation. Historical lookups fail
  closed because legacy data has no enrollment intervals (22/22 focused tests; TypeScript check).
  Plugin-runtime binding and historical enrollment storage remain open
  ([evidence](../acceptance/mp2-roster-enrollment-runtime-contract-2026-09-16.md)).
- 2026-09-16 progress: the plugin now has additive enrollment-interval storage plus guarded,
  backup-bound, journaled adoption of current legacy memberships. Range and one-open-membership
  constraints are enforced; local adoption/package tests pass 6/6 and plugin CLI verifies all
  migration checksums. No live cutover occurred, and legacy data cannot recreate prior transfers
  ([evidence](../acceptance/mp2-enrollment-interval-adoption-2026-09-16.md)).
- 2026-09-16 progress: `ACADEMIC_ROSTER_READ_OWNER=plugin` reversibly routes roster/enrollment
  reads through intervals under repeatable-read isolation. Overlap and missing-profile checks fail
  closed; current-day results must match legacy membership, while historical reads use interval
  history. Legacy remains default (25/25 combined Directory tests; TypeScript check)
  ([evidence](../acceptance/mp2-enrollment-read-routing-2026-09-16.md)).
- [ ] MP2-005 Publish lifecycle/outbox event contracts for student/class/enrollment changes.
- [ ] MP2-008 Dependent fixtures prove Attendance/Timetable/Exam/Learning/Finance compatibility.
- 2026-09-15 progress: fixture consumers for attendance/timetable/finance pass in scaffold test; runtime integration is partially evidenced by targeted plugin runtime proof for provider-backed class lookup and membership resolution (1 pass, 9 skipped in focused run).
- 2026-09-15 progress: first real dependent service integration completed for scoring class-admin sheet scoping via `DirectoryService.classesForUser`, with focused service tests passing (2/2) and direct `prisma.class.findMany` avoided on the migrated path.
- 2026-09-15 progress: second dependent service integration completed for attendance record and bulk record paths; CLASS_ADMIN class access now resolves through `DirectoryService.classesForUser` before student/class attendance writes, with focused attendance tests passing (3/3 across targeted runs).
- 2026-09-15 progress: third dependent service integration completed for exam student list scoping; `ExamService.getStudentExams` now resolves student class memberships via `DirectoryService.classesForUser` and retains global-exam fallback, with focused exam tests passing (2/2).
- 2026-09-15 progress: fourth dependent service integration completed for learning/courses student listing; `CoursesService.getStudentCourses` now resolves class scope via `DirectoryService.classesForUser` while preserving enrollment-based visibility, with focused courses tests passing (3/3).

### C. UI and operations

- [~] MP2-006 Academic UI extension set: students, teachers, classes, years, registration.
- 2026-09-15 progress: read-only department list declarative UI exists in the initial plugin
  package; creation/edit/delete remain disabled pending a consistency policy, while students,
  teachers, classes, years and registration remain open.
- 2026-09-16 progress: read-only Study Year plugin API routes (`study-years`,
  `study-years/current`) and declarative list page now exist in
  `plugins/wattanam.academic-management`. Core `/study-years` compatibility routing supports
  plugin-owned reads with legacy default while all writes fail closed in plugin mode until
  certified consistency policy and adoption evidence are complete
  ([local evidence](../acceptance/mp2-study-year-plugin-route-preflight-2026-09-16.md)).
- 2026-09-16 progress: Study Year and Class write UI/API foundations are complete in the plugin.
  Core `/study-years` and `/classes` mutations dispatch to plugin handlers in plugin mode; plugin
  handlers enforce invariants (unique year, single current year, class-teacher/class-admin role
  checks, study-year deletion guard, student add/update/remove/cleanup against core tables).
  Controller specs and plugin reference test pass; backend build passes.
- [~] MP2-007 Migration toolkit scripts: preflight, dry-run, adopt, reconcile, rollback.
- 2026-09-15 progress: department/membership preflight and additive target migrations implemented;
  backup-bound zero-write dry-run plus two-phase journaled adoption/reconciliation are locally
  verified, including post-commit crash resume. Signing, restored-backup execution, rollback and
  hosted certification remain open.
- 2026-09-16 progress: enrollment adoption adds a separate exact-fingerprint journal and
  reconciliation phase. Restored-backup execution and a combined rollback/cutover marker remain
  open.
- 2026-09-16 progress: Study Year preflight script added with deterministic ordering, single-current
  invariant checks and target-table readiness validation. Local script tests and package checks
  pass; restored-backup execution and rollback evidence remain open
  ([local evidence](../acceptance/mp2-study-year-plugin-route-preflight-2026-09-16.md)).
- 2026-09-16 progress: Study Year dry-run/adopt script added with strict confirmation, backup-bound
  journal identity, resumable chunked copy, unchanged-source verification and exact source/target
  reconciliation. Focused script tests pass; restored-backup execution and rollback certification
  remain open ([local evidence](../acceptance/mp2-study-year-adoption-toolkit-2026-09-16.md)).
- 2026-09-16 progress: Class preflight and dry-run/adopt scripts are added with deterministic
  chunking, backup-bound journal identity and exact source/target reconciliation for additive
  namespaced Class copy. Class cutover-readiness and rollback drill extensions remain open
  ([local evidence](../acceptance/mp2-class-plugin-route-adoption-toolkit-2026-09-16.md)).
- 2026-09-16 progress: Academic cutover-readiness now checks Class source/target parity and
  reconciled Class journal state, and a Class rollback drill script can restore compatibility
  route ownership to legacy without deleting datasets. Command-output test capture is pending due
  a terminal execution-output issue in this session
  ([local evidence](../acceptance/mp2-class-cutover-readiness-rollback-drill-2026-09-16.md)).
- 2026-09-16 progress: Academic cutover-readiness now includes Study Year source/target parity and
  reconciled-journal verification. A Study Year rollback drill script now proves compatibility-route
  restoration can be journaled without deleting source/target data. Local tests pass; hosted
  restored-backup drill evidence remains open
  ([local evidence](../acceptance/mp2-study-year-cutover-readiness-rollback-drill-2026-09-16.md)).
- 2026-09-15 progress: `/departments` compatibility routing defaults to legacy; explicit plugin
  mode supports read-only restored-backup inspection and rejects create/update/delete. Reverting
  the switch restores legacy; full live cutover/rollback remains open.
- 2026-09-15 progress: read-only cutover readiness now checks source/target parity, both reconciled
  journals, backup, active plugin and maintenance-lock absence. It cannot authorize production
  cutover while assignment and membership consumers still use legacy storage (13/13 script tests).
- [ ] MP2-009 Certification and pilot: clean install, lifecycle, restore and controlled rollout evidence.

## Known risks and controls

- Risk: `User` model carries mixed account and domain-profile concerns.
  Control: complete explicit profile split before moving academic tables/routes.
- Risk: dependent plugins query academic tables directly.
  Control: contract tests reject cross-namespace reads and enforce contract-only access.
- Risk: legacy route compatibility drifts during migration.
  Control: keep thin compatibility proxies with explicit removal version and test coverage.

## Evidence targets

- docs/acceptance/mp2-academic-foundation-baseline-2026-09-15.md
- docs/acceptance/mp2-academic-contracts-2026-09-15.md
- docs/acceptance/mp2-academic-contracts-YYYY-MM-DD.md
- docs/acceptance/mp2-academic-migration-drill-YYYY-MM-DD.md
- docs/acceptance/mp2-academic-dependent-fixtures-YYYY-MM-DD.md
- docs/acceptance/mp2-academic-foundation-summary-YYYY-MM-DD.md
