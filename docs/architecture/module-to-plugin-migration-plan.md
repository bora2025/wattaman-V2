# Wattanam Business Modules to Official Plugins Migration Plan

Status: **approved and executing; MP-0 complete, MP-1 proof complete, Document Designer extraction and MP-2 foundation in progress**
Written: 2026-09-11  
Parent decision: [Wattanam Lean Core and Plugin-First Architecture Plan](./wattanam-lean-core-plugin-first-plan.md)
Execution tracker: [Module-to-Plugin Migration Progress Checklist](./module-to-plugin-progress-checklist.md)

## 1. Purpose

This document defines how the existing customer-school business modules will become independently
installable official plugins. It covers backend code, database ownership, browser and mobile UI,
navigation, permissions, jobs, realtime features, notifications, scanning, reports, printing,
files, migration, backup, rollback and marketplace publication.

A module is **not** a plugin merely because its NestJS directory was moved. The extraction is
complete only when the whole vertical feature can be absent from a core-only installation and can
be installed from the marketplace without rebuilding core.

## 2. Migration principles

1. Move coherent business capabilities, not individual screens.
2. Keep platform infrastructure in lean core.
3. A plugin owns its database namespace and all business rules for its feature.
4. Plugins use versioned contracts, never another plugin's tables or implementation code.
5. Customer schools install only through the Wattanam Marketplace or official repository; local
   package upload is not a customer feature.
6. Existing data is copied, reconciled and retained for rollback before legacy cleanup.
7. Disabling a plugin preserves its data and keeps core administration operational.
8. Every plugin is signed, immutable, entitlement-aware, auditable and recoverable.
9. Rich UI, reports and print views move with the module.
10. Extraction proceeds one plugin at a time through the same certification pipeline.

## 3. Lean core boundary

The following stays permanently in `backend/src` and the core frontend shell:

- Installation identity, setup, configuration and school profile.
- Authentication, account recovery, MFA, sessions and generic identities.
- Organization membership, roles, permissions and policy evaluation.
- Plugin runtime, registry, capability enforcement and lifecycle.
- Marketplace linking, entitlement cache and repository updates.
- Platform subscription billing, nonpayment suspension and recovery.
- Audit, observability, health and security controls.
- Backup, restore, core updates and installation-wide data export.
- Storage, notification, realtime and background-job infrastructure.
- Generic navigation, search and portal shells that discover active plugin extensions.

Core must not retain optional business tables, hidden business endpoints, dormant scheduled jobs or
compiled business pages after the applicable compatibility window closes.

## 4. Target official plugin map

| Plugin ID | Current backend candidates | Complete feature scope |
|---|---|---|
| `wattanam.academic-management` | `classes`, `departments`, `study-years`, `class-registrations`; academic portions currently coupled to users/students | Academic student profiles, admissions, classes, enrollment, study years, departments and subjects shared by dependent plugins |
| `wattanam.attendance` | `attendance`, `session-config`, `holidays`, attendance-related `card-aliases` | Student attendance, manual entry, camera/QR/card/USB scan, corrections, absence logic, sessions, holidays, realtime status, alerts, reports and printing |
| `wattanam.timetable` | `timetable` | Subjects, classrooms, schedules, teacher schedules and timetable reports; attendance records themselves belong to Attendance |
| `wattanam.examination` | `exam`, `scoring` | Exams, questions, attempts, grades, score sheets, gradebook, reports and printing |
| `wattanam.learning` | `courses`, `assignments`, `h5p` | Courses, lessons, assignments, quizzes, interactive content, course engagement and course-specific attendance if product-approved |
| `wattanam.communication` | `announcements` plugin, `posts`, messaging portion of `parent` | Announcements, posts/news, direct messages, recipient rules, realtime delivery and channel fan-out |
| `wattanam.finance` | `fees`; relevant financial reports/budget UI | Student fees, discounts, payment records, receipts, school finance reports, budgets and accountant workflows |
| `wattanam.human-resources` | `salary`, `staff-cv`; staff attendance portions found during inventory | Employee profiles, CV, salary/payroll, staff attendance, staff reports and related print views |
| `wattanam.parent-portal` | parent-facing aggregation portions of `parent` and frontend parent routes | Parent requests/linking and authorized views composed from installed academic, attendance, finance, examination, transport and communication contracts |
| `wattanam.transportation` | `bus` | Routes, stops, vehicles, assignments, driver workflows, live locations, parent tracking and transport reports |
| `wattanam.document-designer` | `card-templates`; certificate/card/QR frontend workflows and supporting APIs found during inventory | Student/staff cards, certificates, templates, QR assets, previews, bulk generation and print layouts |
| `wattanam.reporting` | `reports`; domain report code discovered elsewhere | Cross-feature dashboards and exports built only on published plugin read models/contracts |

The table is a target, not permission to move a directory immediately. LC-1 inventory must resolve
every mixed module and every Prisma relationship before ownership becomes final.

## 5. Current Wattanam module register

Repository review date: **2026-09-11**. The current source contains 39 Nest feature modules beneath
`backend/src`, 82 Prisma models, 136 Next.js `page.tsx` files, and one official plugin directory.
This is the baseline that MP-0 must reconcile. Counts may change; CI should regenerate the inventory
rather than treating these numbers as permanent architecture.

### 5.1 Current backend modules

| Current module name | Source directory | Current classification | Proposed target |
|---|---|---|---|
| Announcements | `backend/src/announcements` | Compatibility proxy | Keep only during legacy URL window; business owner is existing `plugins/announcements`, later merge/retain per Communication ADR |
| Assignments | `backend/src/assignments` | Business module | `wattanam.learning` |
| Attendance | `backend/src/attendance` | Business module | `wattanam.attendance` |
| Audit | `backend/src/audit` | Core infrastructure | Lean core |
| Auth | `backend/src/auth` | Core, currently coupled to user/profile data | Lean-core account/authentication parts; split academic/employee profiles during ownership design |
| Backup | `backend/src/backup` | Core infrastructure | Lean core |
| Bus | `backend/src/bus` | Business module | `wattanam.transportation` |
| Card Aliases | `backend/src/card-aliases` | Mixed/shared identifier feature | Attendance aliases to `wattanam.attendance`; other device aliases require inventory decision |
| Card Templates | `backend/src/card-templates` | Business module | `wattanam.document-designer` |
| Classes | `backend/src/classes` | Business module | `wattanam.academic-management` |
| Class Registrations | `backend/src/class-registrations` | Business module | `wattanam.academic-management` admissions/intake |
| Courses | `backend/src/courses` | Business module | `wattanam.learning` |
| Database | `backend/src/database` | Core infrastructure | Lean core; expose only scoped adapters |
| Data Export | `backend/src/data-export` | Core recovery/compliance | Lean core for whole-school owner export; domain exports remain with their plugins |
| Departments | `backend/src/departments` | Business module | `wattanam.academic-management` |
| Directory | `backend/src/directory` | Shared capability with academic coupling | Lean-core generic identity directory; remove Class/Student dependency and add academic contract |
| Exam | `backend/src/exam` | Business module | `wattanam.examination` |
| Fees | `backend/src/fees` | Business module | `wattanam.finance` |
| Health | `backend/src/health` | Core infrastructure | Lean core plus plugin health aggregation |
| Holidays | `backend/src/holidays` | Attendance business support | `wattanam.attendance`, unless a future calendar ADR creates a shared calendar contract |
| Installation | `backend/src/installation` | Core infrastructure | Lean core |
| Marketplace | `backend/src/marketplace` | Core commercial client | Lean core |
| School Access | `backend/src/marketplace/school-access.module.ts` | Core billing enforcement | Lean core |
| Notification | `backend/src/notification` | Shared delivery infrastructure | Lean core capability adapter |
| Notification Preference | `backend/src/notification-preference` | Shared user preference/digest infrastructure | Lean core preferences; business digest composition belongs to plugins |
| Observability | `backend/src/observability` | Core infrastructure | Lean core with per-plugin dimensions |
| Parent | `backend/src/parent` | Mixed parent linking and messaging | Parent linking/views to `wattanam.parent-portal`; messages to `wattanam.communication`; realtime transport stays core |
| Plugins | `backend/src/plugins` | Core plugin host | Lean core |
| Posts | `backend/src/posts` | Business content module | `wattanam.communication` or a separately approved Content plugin |
| Reports | `backend/src/reports` | Mixed aggregation module | Domain reports move with owners; cross-feature aggregation to `wattanam.reporting` |
| Salary | `backend/src/salary` | Sensitive business module | `wattanam.human-resources` |
| Scoring | `backend/src/scoring` | Business module | `wattanam.examination` |
| Session Config | `backend/src/session-config` | Attendance business support | `wattanam.attendance` |
| Site Settings | `backend/src/site-settings` | Core configuration | Lean core; plugin settings use scoped plugin settings |
| Staff CV | `backend/src/staff-cv` | Sensitive business module | `wattanam.human-resources` |
| Storage | `backend/src/storage` | Shared infrastructure | Lean core capability adapter |
| Study Years | `backend/src/study-years` | Business module | `wattanam.academic-management` |
| Timetable | `backend/src/timetable` | Mixed scheduling and teacher-attendance data | Scheduling to `wattanam.timetable`; attendance records to the approved Attendance/HR owner |
| Updates | `backend/src/updates` | Core infrastructure | Lean core |

`backend/src/app.module.ts` is the root composition module and is not counted as a feature module.
`common` and `config` are source directories but do not currently declare Nest feature modules; they
remain core support code and must not acquire business behavior.

### 5.2 Current Prisma model groups

The schema is still physically monolithic. These names identify the real data that must be assigned,
not just the Nest directory that happens to access it:

| Proposed owner | Current Prisma model names |
|---|---|
| Lean core identity/security | `User`, `RefreshToken`, `PasswordResetToken`, `AuditLog`, `AuditCleanupSchedule`, generic parts of `Notification` and `NotificationPreference` |
| Lean core installation/plugin platform | `Installation`, `PluginInstallation`, `MarketplaceRegistration`, `MarketplaceSchoolControl`, `MarketplacePendingLink`, `MarketplaceProxyLink`, `PluginPermissionGrant`, `PluginNotificationUsage`, `PluginMigration`, `PluginSetting`, `PluginJobDefinition`, `PluginJobRun`, `PluginEntitlementCache` |
| Academic Management | `Class`, `Student`, `ClassRegistration`, `ClassRegistrationSettings`, `ClassRegistrationField`, `StudyYear`, `Department`; timetable subject/class ownership must be normalized |
| Attendance | `Attendance`, `SessionConfig`, `Holiday`, `CardAlias`, `AttendanceFormatRule`; staff and course attendance follow their separate decisions |
| Human Resources | `StaffAttendance`, `StaffWeeklySchedule`, `Salary`, `StaffProfile`, `StaffEducation`, `StaffWorkExperience`, `StaffCertification` |
| Document Designer | `CardTemplate` plus any certificate/QR persistence discovered outside Prisma |
| Finance | `FeeRecord`, `FeePayment`, `FeeSettings` |
| Timetable | `Timetable`, `TimetableSubject`, `TimetableClass`, `TimetableClassroom`, `TimetableTeacher`, `TimetableLesson`, `TimetableEntry`; `TimetableTeacherAttendance` requires ownership decision |
| Examination | `ScoreSheet`, `ScoreSheetClass`, `ScoreSubject`, `ScoreExamTab`, `ScoreEntry`, `Exam`, `ExamQuestion`, `ExamAttempt` |
| Transportation | `Bus`, `BusRoute`, `BusStop`, `BusLocation` |
| Learning | `Assignment`, `AssignmentSubmission`, `QuizQuestion`, `QuizAnswer`, `Course`, `CourseLesson`, `LessonPage`, `CourseEnrollment`, `LessonAttempt`, `PageResponse`, `CourseSession`, `CourseAttendance`, `LessonView` |
| Communication/Parent Portal | `Message`, legacy `Announcement`, legacy `AnnouncementRead`, `ParentLinkRequest`, `Post` |
| Core site configuration | `SiteSetting` |

The legacy `Announcement` and `AnnouncementRead` models remain rollback data after the official
announcements-plugin cutover; they are not evidence that announcements still has two owners.

### 5.3 Current user-visible module names

The current frontend exposes these customer-school areas. Each row must be included in a plugin UI
inventory even when no same-named Nest module exists:

| User-visible module | Representative current routes | Proposed owner |
|---|---|---|
| Dashboard and Search | `/admin`, `/admin/search` | Lean-core shell with plugin-contributed cards/search providers |
| User Management | `/admin/users`, `/admin/profile` | Lean core generic accounts; domain profiles split out |
| Teacher, Student and Employee Management | `/admin/teachers`, `/admin/students`, `/admin/employees`, employee CV/print | Academic Management for student/teacher academic profiles; Human Resources for employee/CV data |
| Classes and Study Years | `/admin/classes`, `/admin/study-years` | Academic Management |
| Class Registration | `/admin/class-registrations`, `/register` | Academic Management admissions/intake |
| Attendance | admin/teacher attendance and edit pages | Attendance |
| Camera, QR, Card and USB Scan | `/admin/camera`, `/teacher/camera`, `/employee/scan`, `/wattaman/scan`, `/wattaman/teacher-scan`, `/wattaman/usb-scan` | Attendance, except HR-owned staff-attendance flows |
| Session Settings and Holidays | `/admin/session-settings`, `/teacher/session-settings`, `/admin/holidays` | Attendance |
| Staff Attendance | `/admin/staff-attendance`, edit and teacher staff-attendance pages | Human Resources, using shared attendance-engine contract if approved |
| Timetable | `/admin/timetable/*` including subjects, classrooms, lessons, schedules and teachers | Timetable |
| Examination, Scoring and Gradebook | `/admin/exams`, `/admin/scoring`, student/teacher exam and score routes | Examination |
| Courses and Assignments | student/teacher course, lesson, assignment, quiz, engagement and course-attendance routes | Learning |
| Communication | `/admin/communication`, teacher announcements, student/teacher messages | Communication |
| Parent Portal and Requests | `/admin/parents`, `/admin/parent-requests`, `/parent/*`, `/student/parent` | Parent Portal with optional source-plugin adapters |
| Fees and Accountant | `/admin/fees`, `/accounter/fees`, accountant dashboard/settings | Finance |
| Budget and Financial Reports | `/accounter/budget`, `/admin/budget-report`, print view | Finance |
| Salary | `/admin/salary` | Human Resources |
| Bus | `/admin/bus`, `/parent/bus` | Transportation |
| Reports and Print | admin/student/staff/teacher/reporting and print routes | Each domain owns its report; Reporting owns approved cross-feature aggregation |
| Card Designer and Cards | `/admin/card-designer/*`, `/admin/student-cards`, `/admin/staff-cards`, employee card | Document Designer |
| Certificates and QR Codes | `/admin/certificate`, `/admin/qr-codes` | Document Designer |
| Posts and Appearance Content | `/admin/appearance/posts/*`, public/content presentation discovered in inventory | Communication or separately approved Content plugin |
| LaTeX Editor | `/tools/latex-editor` | Document Designer if used for documents; otherwise separate optional Tool plugin |
| Notifications | `/admin/notifications`, `/settings/notifications` | Core inbox/preferences; plugin-originated content remains owned by originating plugin |
| Backup, Audit, Licensing and Platform Billing | `/admin/backup`, `/admin/audit`, `/admin/licensing`, `/admin/platform-billing` | Lean core |
| Plugin Manager and Marketplace Link | `/admin/plugins`, `/marketplace`, `/marketplace/link/*` | Lean core customer control surface |
| Suspended School Screen | `/suspended` | Lean core billing enforcement/recovery |

### 5.4 Existing official plugin

The only current official plugin directory is `plugins/announcements`. Its business data and routes
are the extraction precedent; `backend/src/announcements` is a thin compatibility proxy. Before it
is used as the general template, re-certify it against marketplace-only installation, UI v2,
API/worker artifact distribution, backup/restore and the current security review.

### 5.5 Unresolved ownership decisions found by this review

- `User` currently represents account and domain-person concerns; these must be separated before
  Academic Management or Human Resources extraction.
- `Student` and `Class` are referenced widely and cannot simply be renamed into plugin tables.
- Staff attendance, timetable teacher attendance and course attendance are different business
  records and need explicit owners plus shared terminology.
- Reports are distributed across `reports`, attendance, timetable, finance, scoring and frontend
  pages; each report must be inventoried individually.
- Certificates, QR codes, budgets and some people-management pages have no same-named backend module;
  their actual API/service/model dependencies must be traced before migration.
- Parent Portal and Reporting are composition plugins; their optional-dependency behavior must be
  designed before they can be independently installed.
- `Notification` is shared core storage today. Define whether plugin notifications remain in the
  core inbox or move to per-plugin data while preserving a unified user experience.

## 6. Required platform work before extraction

### 6.1 Declarative UI v2

The current `ui.pages` contract supports only `json-settings`. Before a real business module can
move, the core-rendered plugin UI must support:

- Tables, sorting, filtering, pagination and selectable rows.
- Forms, field validation, conditional fields and confirmation dialogs.
- List/detail/create/edit workflow routing.
- Summary cards, charts and dashboards.
- File upload/download through scoped storage.
- Camera/QR and keyboard-wedge scanner inputs.
- Realtime refresh and progress indicators.
- Print layouts plus CSV/PDF export actions.
- Khmer and launch-language localization.
- Timezone/currency-aware values and accessible responsive layouts.

No arbitrary plugin JavaScript should execute in the core browser origin. If declarative UI cannot
represent an approved feature, that feature stays in core until a separately reviewed sandboxed UI
model exists.

### 6.2 Plugin service contracts

Add versioned contracts for:

- Generic identity and contact lookup from core.
- Academic profiles, class rosters and enrollment from Academic Management.
- Parameterized plugin routes with schema validation.
- Cross-plugin commands, queries and read models.
- Transactional outbox events with idempotency, retry and dead-letter handling.
- Domain report registration and export streaming.
- Print-template registration.
- Device/scanner registration if shared across multiple plugins.

### 6.3 Runtime artifact distribution

Marketplace artifacts must be stored by digest. API and worker instances independently download,
verify and cache the same version. Activation uses a registry generation and succeeds only when all
required runtime roles are ready. Mutable plugin files use shared object storage in multi-service
Railway deployments.

### 6.4 Migration framework

Provide a standard plugin adoption toolkit with:

- Preflight and source-schema version checks.
- Automatic backup reference.
- Journaled, resumable and idempotent batches.
- Row, relationship, monetary-total and file reconciliation.
- Dry-run mode.
- Maintenance-mode coordination.
- Cutover marker and compatibility-proxy switch.
- Rollback without deleting either dataset.
- Signed evidence report.

## 7. Standard plugin package structure

```text
plugins/wattanam.<plugin-name>/
├── manifest.json
├── backend/
│   └── index.js
├── frontend/
│   ├── pages.json
│   ├── navigation.json
│   └── translations/
├── migrations/
├── adoption/
│   ├── preflight.js
│   ├── adopt.js
│   ├── reconcile.js
│   └── rollback.js
├── tests/
│   ├── contract/
│   ├── authorization/
│   ├── lifecycle/
│   └── migration/
├── README.md
├── PRIVACY.md
├── SUPPORT.md
└── CHANGELOG.md
```

Published packages contain built runtime artifacts, not TypeScript source that must be compiled on
the customer school.

## 8. Per-module extraction worksheet

Complete this worksheet before coding each plugin:

| Area | Required inventory |
|---|---|
| Business behavior | Commands, validation, calculations, status transitions and invariants |
| Backend | Controllers, services, gateways, providers and imports |
| Database | Models, tables, indexes, constraints, sequences and relationships |
| API | Methods, paths, request/response schemas, errors and consumers |
| Frontend | Every role-specific page, component, hook and route |
| Mobile | Screens, deep links, offline behavior and minimum app version |
| Navigation | Role, section, label, icon, order and permission |
| Access | Permissions, row-level scope and administrator grant defaults |
| Jobs | Schedule, owner process, idempotency, retry and suspension behavior |
| Realtime | Connections, event names, authorization and disconnect behavior |
| Notifications | Recipients, templates, preferences, quota and audit behavior |
| Files | Mutable storage, exports, imports, generated files and retention |
| Reports | Filters, totals, snapshots, CSV/PDF and print layouts |
| Integrations | Core capabilities, plugin contracts and external providers |
| Lifecycle | Install, activate, disable, update, uninstall and reinstall behavior |
| Migration | Legacy source, batch plan, reconciliation and rollback window |
| Operations | Health, logs, metrics, alerts, support bundle and kill switch |
| Governance | Publisher, pricing, entitlement, privacy, support and end-of-life |

An inventory item without a target owner blocks extraction.

## 9. Standard extraction process

### Step 1 — Freeze and inventory

- Stop adding new feature behavior to the legacy module.
- Complete the worksheet.
- Record imports into and out of the module.
- Assign every table, page, report and job to one owner.
- Capture baseline behavior and representative production-shaped data.

### Step 2 — Define boundaries

- Publish required core/plugin contracts before moving implementation.
- Remove direct cross-domain database access.
- Define plugin dependencies and degraded modes.
- Define data snapshots required for historical accuracy.
- Approve permissions and entitlement behavior.

### Step 3 — Build the plugin vertically

- Create manifest, migrations and package metadata.
- Move business rules and APIs.
- Rebuild all UI through supported plugin UI contracts.
- Register navigation and granular permissions.
- Move jobs, realtime behavior, notifications, reports and print views.
- Add health, metrics and support diagnostics.

### Step 4 — Certify fresh installation

- Pack and sign the immutable artifact.
- Publish it to a non-production marketplace channel.
- Install it into a clean core-only school.
- Test every supported role and workflow.
- Disable, update, remove and reinstall it.
- Back up and restore it into a new installation.

### Step 5 — Adopt existing data

- Enter maintenance mode if consistency requires it.
- Create a recovery set.
- Run preflight and dry-run.
- Copy data in resumable batches.
- Reconcile rows, relationships, totals, timestamps and files.
- Record a cutover journal and activate the plugin.

### Step 6 — Compatibility window

- Keep legacy tables read-only and untouched.
- Use thin Prisma-free proxies only for explicitly supported legacy URLs.
- Monitor failures, latency, reconciliation drift and support incidents.
- Test rollback on a copy of the migrated installation.

### Step 7 — Final cleanup

- Close the rollback window through release approval.
- Remove legacy navigation, pages, controllers, providers and imports.
- Remove legacy tables in a separate reviewed migration.
- Remove compatibility proxies in the announced release.
- Update architecture inventory and attach final evidence.

## 10. Attendance extraction blueprint

Attendance is treated as one complete vertical plugin:

```text
wattanam.attendance
├── take attendance
├── manual entry and correction
├── camera / QR / card / USB scanning
├── sessions and holidays
├── duplicate and late/absence rules
├── realtime updates
├── absence notifications
├── administrator and teacher reports
└── print and export views
```

### 10.1 Ownership

Move `attendance`, `session-config`, `holidays`, attendance-specific aliases, attendance pages,
scanner pages, teacher reports and attendance print views. Generic authentication, audit,
notification transport, realtime transport and job scheduling remain core capabilities.

Staff attendance requires an explicit decision: recommended ownership is Human Resources, while
the Attendance plugin may provide a shared attendance engine contract. Course-session attendance
is recommended to remain with Learning because its lifecycle is tied to course meetings. These
records must not be silently mixed into student school-day attendance.

### 10.2 Data model

Plugin tables should cover attendance records, sessions, corrections, scan events, holidays,
aliases and notification state. References to core identities or Academic Management entities use
stable IDs without cross-namespace foreign keys. Historical records keep display-name, number and
class snapshots required for later reports.

### 10.3 Commands and idempotency

All scan methods call one command with subject, session, time, method, device and idempotency key.
The server validates enrollment, session window, duplicate rules, device authorization, timezone,
permission and school-access state. Client time is evidence only; authoritative time comes from the
server under an approved clock policy.

### 10.4 Required permissions

```text
wattanam.attendance.view
wattanam.attendance.scan
wattanam.attendance.mark
wattanam.attendance.correct
wattanam.attendance.report
wattanam.attendance.print
wattanam.attendance.configure
wattanam.attendance.manage-devices
```

Authorization includes row scope: teachers cannot operate on unrelated classes merely because they
hold the general `mark` permission.

### 10.5 Attendance gate

Attendance extraction cannot start until Academic Management roster contracts, scanner-capable UI
v2, parameterized routes, realtime authorization, worker artifact delivery and resumable adoption
are certified. Completion requires real camera and USB-device testing plus report-total comparison
against legacy data.

## 11. Dependency graph

```text
Lean Core
├── Academic Management
│   ├── Attendance
│   ├── Timetable
│   ├── Examination
│   ├── Learning
│   └── Finance
├── Human Resources
├── Transportation
├── Communication
├── Document Designer
├── Parent Portal
│   └── optional adapters to Academic, Attendance, Finance,
│       Examination, Transportation and Communication
└── Reporting
    └── versioned read-model adapters only
```

Parent Portal and Reporting must use optional adapters so installing either does not automatically
force every business plugin to be installed. The plugin manager rejects dependency cycles and
prevents disabling an active required dependency.

## 12. Recommended migration waves

### Wave MP-0 — Platform prerequisites

- [x] Accept lean-core boundaries and plugin ownership ADRs.
- [x] Build UI v2 and parameterized route contracts.
- [x] Build event/outbox and cross-plugin query contracts.
- [x] Build digest-addressed API/worker artifact delivery.
- [x] Build the standard adoption/certification toolkit.
- [x] Add a clean core-only CI and Railway deployment drill.

Gate: a non-trivial reference plugin installs without rebuilding core and survives full lifecycle,
backup and restore.

### Wave MP-1 — Low-coupling proof

- [x] Re-certify `plugins/announcements` under marketplace-only installation.
- [~] Extract Document Designer (package/data groundwork implemented; UI, hosted adoption,
  recovery, pilot and legacy cleanup remain open).
- [ ] Extract Transportation if its identity/location contracts are ready.

Gate: independently installed UI, files, realtime behavior and print output work on a clean school.

### Wave MP-2 — Academic foundation

- [~] Separate core identity from academic student profiles.
- [ ] Extract Academic Management.
- [ ] Migrate classes, study years, departments, admissions and enrollments.
- [~] Publish roster/enrollment contracts.

Gate: core-only accounts work without the plugin, while dependent-plugin contract tests pass when it
is installed.

### Wave MP-3 — Academic dependants

- [ ] Extract Timetable.
- [ ] Extract Attendance as the complete scan-to-print vertical slice.
- [ ] Extract Examination and Scoring.
- [ ] Extract Learning, Assignments and H5P.

Gate: dependency lifecycle, real devices, event consistency and production-shaped data adoption are
certified.

### Wave MP-4 — Sensitive business domains

- [ ] Extract Finance with monetary reconciliation and immutable receipts.
- [ ] Extract Human Resources with salary/privacy controls.
- [ ] Complete Communication and Parent Portal composition.

Gate: finance, payroll, child-data privacy and messaging authorization receive specialist review.

### Wave MP-5 — Aggregation and cleanup

- [ ] Extract Reporting using published read models only.
- [ ] Remove remaining compiled business navigation and pages from core.
- [ ] Remove expired compatibility proxies and legacy tables.
- [ ] Make core-only the default production installer profile.

Gate: fresh core contains no optional business schema/UI and every supported legacy school has a
verified migration or documented exception.

## 13. Per-plugin acceptance gate

Each plugin must prove:

- [ ] It installs from marketplace into a clean core without a frontend rebuild.
- [ ] Signature, digest, publisher, core/runtime range, dependencies and entitlement are verified.
- [ ] No undeclared capability or cross-namespace database access succeeds.
- [ ] Every backend route and UI action enforces permission plus row scope.
- [ ] All role-specific pages, mobile behavior, navigation and deep links work.
- [ ] Jobs and realtime handlers stop safely when disabled or school access is suspended.
- [ ] Notifications respect preferences, quota, localization and audit requirements.
- [ ] Reports, exports and print totals match authoritative plugin data.
- [ ] Disable preserves data and hides routes/navigation.
- [ ] Update failure returns to one healthy version.
- [ ] Uninstall preserves data by default; reinstall safely adopts it.
- [ ] Backup and clean-project restore reproduce the plugin, data, files and grants.
- [ ] Legacy adoption is resumable, reconciled and reversible.
- [ ] API and worker load the identical artifact digest after restart and scale-out.
- [ ] Health, metrics, logs, alerts, privacy and support documents are complete.

## 14. Risks and controls

| Risk | Required control |
|---|---|
| Only backend code moves | Vertical-slice checklist and absence test for all UI/jobs/reports/files |
| Compiled pages remain in core | Install-without-rebuild certification |
| Cross-plugin database coupling | Versioned service/event/read-model contracts and SQL namespace enforcement |
| Existing data is damaged | Recovery set, journaled batches, reconciliation, rollback window |
| Historical reports change after profile edits | Store approved immutable display/value snapshots |
| Scanner sends duplicates | Server-side idempotency keys and device/session validation |
| Plugin disable corrupts work | Drain leases/in-flight actions and publish lifecycle events |
| Worker lacks installed artifact | Digest-addressed shared artifact origin and readiness generation |
| In-process plugin compromises core | Official reviewed publishers only until accepted isolation/governance model |
| Plugin consumes shared resources | Query/job/request/storage/realtime/notification quotas and circuit breakers |
| Marketplace outage blocks school | Signed cached entitlements with explicit offline grace and anti-replay |
| Withdrawn release cannot restore | Contractual recovery archive and quarantined restore policy |
| Parent/Reporting forces all plugins | Optional adapters and explicit degraded empty states |

## 15. Evidence artifacts

For every plugin, store these under `docs/acceptance/`:

- Boundary and ownership inventory.
- Contract and threat-model review.
- Fresh install/lifecycle certification.
- Authorization matrix results.
- Legacy migration and reconciliation report.
- Backup/restore drill.
- Railway API/worker artifact drill.
- Browser/mobile/device evidence where applicable.
- Performance and resource-limit results.
- Security, privacy and publisher approval.
- Production pilot and rollback-window closure.

## 16. Definition of complete migration

The overall program is complete when:

1. A new school installs lean core with no optional business modules, tables, pages or jobs.
2. Every business feature in section 4 is an independently signed and versioned official plugin.
3. Installing a plugin never requires rebuilding or redeploying the core frontend/API image.
4. Core imports no optional business implementation and queries no plugin table.
5. Existing schools retain reconciled data and have a tested rollback path.
6. Marketplace entitlements, backup/restore, API/worker delivery and nonpayment controls work for all
   supported plugin combinations.
7. Legacy modules, routes, pages and tables are removed only after their approved support windows.
8. Production, security, privacy, legal and operational evidence is accepted for each release wave.

## 17. Current action

Finish Document Designer MP1-004 through MP1-012: controlled backup/restore, hosted adoption,
rendered-output comparison, compatibility routing/rollback, complete UI and scoped storage, then
marketplace certification and pilot. Continue Academic Management boundary work in MP-2, but do
not begin Attendance extraction until MP-2 and the remaining LC4 production evidence are complete.
