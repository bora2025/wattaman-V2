# MP-2 Academic Foundation Checklist

Status: in progress
Created: 2026-09-15
Parent tracker: [Module-to-Plugin Migration Progress Checklist](./module-to-plugin-progress-checklist.md)
Source plan wave: [Module-to-Plugin Migration Plan, section 12 MP-2](./module-to-plugin-migration-plan.md)

## Objective

Extract Academic Management so core identity and accounts can run without academic data tables/routes, while dependent plugins consume only published academic contracts.

## Scope for MP-2

- Separate core account identity from academic student and enrollment profiles.
- Extract classes, departments, admissions and enrollment into `wattanam.academic-management`
  ownership; consume Attendance Manager's Study Year contract.
- Publish roster/enrollment contracts for dependent plugins.

## Exit criteria

- [x] Core-only accounts and authentication operate with Academic Management absent
  ([evidence](../acceptance/mp2-core-identity-without-academic-2026-09-25.md)).
- [ ] Academic schema ownership is complete for Student, Class, ClassRegistration and Department;
  Study Year ownership is certified in Attendance Manager.
- 2026-09-23 progress: additive migration `009_create_student_profile` establishes isolated
  plugin-owned academic profile storage keyed by stable core `userId`, with no cross-schema foreign
  key. Local adoption, reconciliation, legacy-default/plugin-explicit reads and atomic
  parity-checked shadow writes now pass; hosted routing and recovery remain open, so this gate is
  not complete.
- 2026-09-23 progress: a zero-write Student profile preflight adds deterministic fingerprinting,
  target readiness checks and aggregate validation for duplicate identity/QR mappings and invalid
  constrained values. Backup-bound journaled adoption is resumable, idempotent and exact-hash
  reconciled; a fail-closed rollback drill preserves both datasets and returns routing metadata to
  legacy (3/3 preflight, 3/3 adoption and 3/3 rollback tests; backend build passes)
  ([evidence](../acceptance/mp2-student-profile-schema-2026-09-23.md)).
- 2026-09-23 progress: class-roster reads and writes now use namespaced Student profiles and
  enrollment intervals locally; removal closes membership without deleting the core account or
  other plugins' records. Published 0.1.0 migrations remain byte-for-byte immutable through an
  exact plugin/migration/checksum compatibility rule (4/4 migration security tests, 6/6 plugin
  reference tests, and package validation pass)
  ([evidence](../acceptance/mp2-academic-immutable-migration-compatibility-2026-09-23.md)).
- 2026-09-23 progress: the plugin runtime no longer queries or mutates core/legacy tables through
  its namespace-scoped database capability. Core identity and role resolution use `directory.read`;
  Student profile editing is restricted to plugin-owned academic fields, with account contact edits
  remaining in User Management (6/6 reference and 16/16 directory tests pass)
  ([evidence](../acceptance/mp2-academic-runtime-sql-isolation-2026-09-23.md)).
- 2026-09-23 reconciliation: Study Year's single owner is Attendance Manager. Core plugin-mode
  routes now target Attendance; Academic class reads/validation consume its versioned read model,
  Academic mutations fail closed, and the duplicate Academic table remains rollback-only. Earlier
  entries below describing Academic Study Year write ownership are superseded
  ([evidence](../acceptance/mp3-study-year-ownership-contract-2026-09-23.md)).
- [x] Admissions and enrollment workflows operate through the plugin boundary. Approved
  registration uses an idempotent capability-gated core STUDENT-account command, then writes only
  plugin-owned profile/enrollment state in one durable transaction
  ([evidence](../acceptance/mp2-admissions-core-account-boundary-2026-09-25.md)).
- [x] Roster and enrollment contracts are versioned and consumed by dependents without cross-plugin SQL
  ([evidence](../acceptance/mp2-plugin-roster-contract-2026-09-25.md)).
- [x] Academic lifecycle events are published with outbox/idempotent delivery guarantees
  ([evidence](../acceptance/mp2-master-reconciliation-2026-09-22.md)).
- [x] UI routes for students/classes/registrations and Academic-owned reference data render from
  plugin extensions without a core rebuild; Attendance Manager owns the separate Study Year UI.
  Hosted browser certification remains tracked separately under MP2-009.
- [ ] Lifecycle drill passes: install, activate, disable, update, remove and reinstall.
- [ ] Backup and restore drill reproduces data, files and grants.
- [x] Evidence is stored under `docs/acceptance/`.

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
- 2026-09-25 progress: the department read boundary is now an owner-side, self-or-administrator
  scoped plugin route. Plugin-read mode binds it only for Academic's active lifecycle, validates
  its envelope, and fails closed after unload. The core directory provider's private Academic
  membership SQL was removed; Academic reference 11/11, Directory/provider/runtime/session 36/36,
  and backend build pass. Write-side profile/assignment migration seams still keep MP2-001 partial
  ([evidence](../acceptance/mp2-academic-runtime-sql-isolation-2026-09-23.md)).
- 2026-09-25 progress: explicit plugin cutover settings now route Department assignment, guardian
  assignment, and user Academic-identity detach through administrator-only, idempotent owner
  commands bound to Academic's active lifecycle. Commands fail closed after unload and reject
  shadow-write conflicts. Plugin-owned detach clears only Academic Class roles, Department
  membership, guardianship, enrollment intervals, and Student Profile; it does not delete
  Attendance or Finance records. Academic reference 11/11, identity/runtime 35/35, and backend
  build pass. At this checkpoint profile enrichment still retained a migration-era read seam; the
  following entry supersedes that limitation for fully plugin-owned reads.
- 2026-09-25 progress: when both Department and Student Profile read owners are `plugin`, auth
  enrichment now dispatches a bounded batch profile contract to the active Academic owner. The
  plugin composes only its own Department/Profile/Enrollment/Class data and resolves guardian/child
  names through the core Directory capability; the adapter validates schema version and exact user
  coverage. Owner contract 11/11, identity/runtime 36/36, and backend build pass. Mixed rollback
  modes and hosted certification remain open, so MP2-001 stays partial.
- 2026-09-25 progress: a complete core-distribution account path now proves password validation,
  ADMIN registration/session issuance, list/search/detail/update, and deletion with no Academic
  provider and no Student/Class/Department/Attendance/Finance client available. The focused core
  identity/session suite passes 8/8. This closes the core-only identity exit criterion, while
  hosted migration-mode certification keeps MP2-001 itself partial
  ([evidence](../acceptance/mp2-core-identity-without-academic-2026-09-25.md)).
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
- 2026-09-23 supersession: the StudyYear portion of the two entries above is historical, not the
  current boundary. Attendance Manager is the sole active owner; core dispatch, UI, read models,
  durable/transient lifecycle events, and the adoption target now point to Attendance. Academic's
  StudyYear routes fail closed and its table is rollback-only
  ([current evidence](../acceptance/mp3-study-year-ownership-contract-2026-09-23.md)).
- [x] Inventory all academic routes/pages and map each to its core or plugin owner
  ([surface inventory](./mp2-academic-surface-inventory.md)).
- 2026-09-16 progress: Class read/write route ownership is wired end-to-end. Core `/classes`
  compatibility routing supports plugin-owned list reads and certified writes (create/update/delete
  and student-management mutations dispatch to the plugin), with legacy default and fail-closed
  guards for uncertified operations. Plugin Class write handlers now create/update namespaced
  Student profiles and enrollment intervals, touching core `User` only for stable account identity;
  removal and cleanup preserve the account and historical membership. Controller specs and plugin reference test pass
  ([local evidence](../acceptance/mp2-class-plugin-route-adoption-toolkit-2026-09-16.md)).
- 2026-09-16 progress: `/classes` now has explicit compatibility ownership (`legacy` default;
  optional plugin-owned list reads) with plugin-mode write fail-close guards in core. Initial
  read-only plugin Class route and declarative Class list page are added in
  `plugins/wattanam.academic-management` ([local evidence](../acceptance/mp2-class-plugin-route-adoption-toolkit-2026-09-16.md)).

### B. Contracts and runtime

- [x] MP2-003 Admissions and class-registration workflows moved behind plugin contracts.
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
- 2026-09-25 completion: approved-registration materialization no longer registers the legacy v1
  subscriber. Academic Management 0.1.8 uses `accounts.student.create`, then atomically creates its
  own Student Profile and Enrollment Interval and publishes a durable v2 approval event. The core
  account command is replica-serialized, journaled and audited; exact retries return the same User
  while changed payloads fail closed
  ([evidence](../acceptance/mp2-admissions-core-account-boundary-2026-09-25.md)).
- [x] MP2-004 Publish roster contracts: class roster, enrollment-at-date, audience resolution.
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
- 2026-09-25 progress: Academic Management itself now publishes versioned historical roster and
  enrollment-at-date routes from its private interval/profile/Class tables. Exact calendar dates,
  overlap/missing-profile corruption, and teacher/class-admin/student/parent row scope are checked
  at the owning plugin boundary (11/11 reference tests; 17/17 with dependent fixtures). Core
  roster/enrollment, class-audience, reverse-membership, and class-lookup reads now dispatch through
  lifecycle-bound plugin routes, validate responses, unbind on deactivation, and fail closed.
  The core directory provider's cross-schema Class/Profile/Enrollment SQL was removed, with a
  static regression assertion and 35/35 focused provider/Directory/runtime tests
  ([evidence](../acceptance/mp2-plugin-roster-contract-2026-09-25.md)).
- [x] MP2-005 Publish lifecycle/outbox event contracts for student/class/enrollment changes.
- 2026-09-16 historical progress: plugin write handlers published versioned lifecycle events for
  the then-Academic-owned StudyYear (`created`, `updated`, `set-current`, `deleted`), Class
  (`created`, `updated`, `deleted`), and
  student class membership (`added-to-class`, `updated`, `removed-from-class`, `cleaned-up`).
  Events carry the mutated entity snapshot and the acting principal. Plugin reference test covers
  all StudyYear/Class/student events; build and controller specs pass.
- 2026-09-16 historical progress: durable outbox publishing was wired inside every StudyYear/Class/student
  write transaction via `tx.publish()` using deterministic idempotency keys. The outbox event
  model supports idempotent insert (`ON CONFLICT` by plugin and idempotency key), retry/backoff,
  dead-letter capture, and replay. Plugin reference test and backend build pass.
- 2026-09-23 ownership correction: Academic retains the Class/student event contract. Attendance
  Manager now publishes all four Study Year lifecycle events after mutation and persists the same
  lifecycle transactionally through its durable outbox with deterministic idempotency keys; its
  strict runtime and controller suites pass 5/5.
- 2026-09-16 progress: a core subscriber (`AcademicLifecycleSubscriber`) now listens to all
  StudyYear/Class/student lifecycle events on `PluginEventBus` so dependent core modules can react
  without coupling to the plugin schema. A focused Jest spec covers study-year, class, and student
  membership events; it passes alongside the approved-registration subscriber spec.
- [x] MP2-008 Dependent fixtures prove Attendance/Timetable/Exam/Learning/Finance compatibility.
- 2026-09-15 progress: fixture consumers for attendance/timetable/finance pass in scaffold test; runtime integration is partially evidenced by targeted plugin runtime proof for provider-backed class lookup and membership resolution (1 pass, 9 skipped in focused run).
- 2026-09-15 progress: first real dependent service integration completed for scoring class-admin sheet scoping via `DirectoryService.classesForUser`, with focused service tests passing (2/2) and direct `prisma.class.findMany` avoided on the migrated path.
- 2026-09-15 progress: second dependent service integration completed for attendance record and bulk record paths; CLASS_ADMIN class access now resolves through `DirectoryService.classesForUser` before student/class attendance writes, with focused attendance tests passing (3/3 across targeted runs).
- 2026-09-15 progress: third dependent service integration completed for exam student list scoping; `ExamService.getStudentExams` now resolves student class memberships via `DirectoryService.classesForUser` and retains global-exam fallback, with focused exam tests passing (2/2).
- 2026-09-15 progress: fourth dependent service integration completed for learning/courses student listing; `CoursesService.getStudentCourses` now resolves class scope via `DirectoryService.classesForUser` while preserving enrollment-based visibility, with focused courses tests passing (3/3).
- 2026-09-16 progress: dependent fixture contract-consumer tests pass end-to-end for Attendance, Timetable, Exam, Learning and Finance (`backend/scripts/mp2-dependent-fixtures.test.js` 6/6). `FeesService.getStudents()` now resolves current enrollment via `DirectoryService.getEnrollmentAtDate()` with a passing boundary spec (2/2). `AttendanceService` now validates `recordAttendance`, `recordBulkAttendance`, `getStudentAttendanceRecords`, `getUserDailyAttendance` and `wattamanScan` through the roster/enrollment contract, with a focused boundary spec passing (9/9); full backend Jest suite is 515 pass / 3 pre-existing unrelated fail.
- 2026-09-22 reconciliation: the Academic reference and all five dependent fixture consumers pass
  again (12/12 combined), with durable command evidence in
  [the master reconciliation record](../acceptance/mp2-master-reconciliation-2026-09-22.md).
- 2026-09-25 migration recheck: Student Profile, Class, and Admissions preflight, resumable
  adoption, and non-destructive rollback suites pass together with the unified cutover-readiness
  gate (30/30). This is deterministic local harness evidence only; Docker was unavailable and no
  restored backup or hosted database was certified
  ([evidence](../acceptance/mp2-local-migration-toolkit-recheck-2026-09-25.md)).

### C. UI and operations

- [x] MP2-006 Academic UI extension set: students, teachers, classes, registration and reference data.
- 2026-09-16 progress: Study Years and Classes now have full declarative list/create/detail/edit
  UI pages in `plugins/wattanam.academic-management`, backed by new plugin-owned GET-by-ID routes.
  Registrations have list/detail/resolve pages backed by new admin routes including
  `PATCH admissions/registrations/:id/resolve`. Class Students has a roster list/add page backed by
  `GET classes/:id/students` and `POST classes/:id/students`. It now also has selectable removal,
  confirmed orphan cleanup, and a row-linked detail/edit page backed by class-scoped GET/PATCH
  routes. The full Academic descriptor passes the UI schema parser; hosted rendering remains open.
  Teachers has a directory page backed
  by `GET teachers`. Navigation includes Departments, Study Years, Classes, Teachers, and
  Registrations. Plugin reference test, backend build, and controller/subscriber specs pass
  ([local evidence](../acceptance/mp2-academic-ui-extension-set-2026-09-16.md)).
- 2026-09-23 ownership correction: Study Year pages and navigation were removed from Academic and
  are now delivered by Attendance Manager; the preceding 2026-09-16 UI sentence is historical.
- 2026-09-25 completion reconciliation: Academic Management 0.1.7 adds canonical Subject
  list/create/edit and Department list/create/edit pages, including adopted legacy identifier
  support. Department compatibility CRUD now dispatches to namespaced owner routes after the
  explicit cutover switch. The declarative descriptor, 14/14 reference tests, 3/3 Department
  controller tests, plugin package validation and backend build pass. This completes the local UI
  implementation item, not the hosted certification item
  ([Department evidence](../acceptance/mp2-academic-department-ownership-2026-09-25.md),
  [Subject evidence](../acceptance/mp2-academic-subject-ownership-2026-09-25.md)).
- 2026-09-16 progress: Study Year and Class write UI/API foundations are complete in the plugin.
  Core `/study-years` and `/classes` mutations dispatch to plugin handlers in plugin mode; plugin
  handlers enforce invariants (unique year, single current year, class-teacher/class-admin role
  checks, study-year deletion guard, and student add/update/remove/cleanup against plugin-owned
  profile and enrollment tables while preserving core accounts).
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
- 2026-09-23 ownership correction: these historically named Study Year scripts now target the
  Attendance-owned table/journal, require Attendance confirmation variables, and retain the old
  filenames and Academic variables only as compatibility aliases. Unified readiness requires both
  plugins active; 9/9 adoption-toolkit and 3/3 cutover-readiness tests pass locally.
- 2026-09-23 progress: Student profile preflight, dry-run/adopt, exact reconciliation and
  non-destructive rollback tooling are locally verified. The runtime provider seam now has
  legacy-default/plugin-explicit reads and atomic shadow writes that reject drift before mutation
  (28/28 focused provider/auth tests). Execution against a restored real-PostgreSQL backup and
  hosted cutover/rollback evidence remain open. The unified Academic cutover-readiness report now
  also fails closed unless Student Profile source/target fingerprints and counts match and its
  backup-bound journal is reconciled (3/3 focused cutover tests)
  ([local evidence](../acceptance/mp2-student-profile-schema-2026-09-23.md)).
- 2026-09-25 supersession: `/departments` compatibility routing still defaults to legacy, but
  explicit plugin mode now routes list/create/update/delete to the namespaced owner. Delete clears
  memberships atomically under a deterministic command key. Reverting the switch restores legacy;
  real-PostgreSQL adoption and hosted cutover/rollback remain open.
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
