# Changelog

## 0.2.6

- Fix officer account creation when the universal form omits an explicit command key.
- Derive a deterministic, retry-safe command key from the normalized email without forbidden characters.
- Disambiguate the custom-field table heading from its form label for mobile and assistive navigation.

## 0.2.5

- Fix Academic Year create and update operations by explicitly casting date inputs to PostgreSQL timestamps.
- Cover both the primary Academic Management routes and the compatibility attendance runtime.

## 0.2.4

- Upgrade the class student roster with a unified Add Student menu for single creation, CSV import, and existing-profile enrollment.
- Add searchable and sortable student sex and date-of-birth columns while retaining row-level edit and removal actions.
- Adopt the universal host's modern list filters and compact creation workflow across Academic Management pages.

## 0.2.3

- Add bounded CSV file import directly to each class roster, with per-row success and error results.
- Add Excel, CSV, and print exports for class student rosters.

## 0.2.2

- Restore class overview navigation to student management and class editing.
- Restore direct student account creation, existing-student enrollment, and per-student editing.
- Add retry-safe idempotency to universal student creation forms.

## 0.2.1

- Declare every durable event and published read model, and use the explicit database transaction capability.
- Namespace the registration-approved durable event without changing stored customer data.

## 0.2.0

- Upgrade the plugin UI contract to the SDK 1.3 universal declarative architecture.
- Move enrollment, registration-field, alert, attendance-window, and review actions into each
  record's Actions column instead of detached bulk-action panels.
- Preserve all published migrations and existing academic, attendance, and ID-card data.
- Declare versioned Academic directory and identity host contracts so activation no longer depends
  on the host recognizing this plugin by its package ID.

## 0.1.59

- Added permission-filtered global search for students, staff, and classes.
- Added direct navigation from search results to the corresponding edit workspace.

## 0.1.54

- Consolidate the administrator menu around the supported academic and attendance workflows.
- Remove duplicate or retired navigation entries for Dashboard, Departments, Subjects, Teachers,
  Registrations, Registration Settings, Attendance Scanner, Self-attendance QR, Scan Attendance,
  and Self-attendance Review.
- Rename Attendance Reports to Student Attendance Reports so it is distinct from Staff Attendance
  Reports.
- Preserve shared department, scan, and attendance storage still required by officer profiles and
  the retained student/staff attendance workflows.

## 0.1.53

- Repair upgrades from 0.1.51 by removing the obsolete student-only attendance-session constraint before staff defaults are inserted.
- Restore an explicit supported-scope constraint for student, teacher, and staff attendance sessions.

## 0.1.52

- Consolidate staff attendance navigation on the four-session Staff Attendance
  and Staff Attendance Reports workflow while retaining legacy records and routes.
- Fix PostgreSQL UUID, date, and timestamp parameter typing across officer detail,
  legacy officer attendance, and staff scanning queries.
- Seed four usable staff attendance sessions and select the newest Study Year when
  an existing installation has no current year.
- Record student check-out scans in `checkOutTime` instead of incorrectly writing
  every attendance session to `checkInTime`.

## 0.1.51

- Fix Staff ID Cards by casting officer UUIDs to text when joining attendance
  identifiers, matching the identifier table schema.
- Restore active staff cards and their QR codes instead of returning HTTP 500.

## 0.1.50

- Publish officer and attendance lifecycle events with explicit event versions,
  preventing successful database writes from being reported as server errors.
- Add regression coverage requiring all literal plugin event names to end in a
  version suffix.

## 0.1.49

- Fix officer creation by explicitly casting bound profile IDs, department IDs,
  and employment dates to their PostgreSQL column types.
- Complete the officer profile and staff attendance identifier steps without the
  UUID parameter type error that previously followed account creation.

## 0.1.48

- Normalize PostgreSQL date values before matching attendance records to report
  days, so saved QR and USB scans appear in student and staff reports.
- Cover real database `Date` objects in the authoritative report workflow test.

## 0.1.47

- Preserve saved student and staff attendance records when their session number is
  no longer present in the current session configuration.
- Keep dashboard totals, attendance reports, and print previews consistent after
  administrators edit session times or replace session definitions.

## 0.1.46

- Fix student attendance reports and print previews to load class rosters from
  Academic Management enrollment data instead of unavailable legacy core models.
- Verify that a saved QR attendance record flows into the authoritative report.

## 0.1.45

- Display each class's study days and provide a dedicated editor with Saturday,
  Sunday, weekday, and seven-day presets.
- Replace the raw class edit workflow with a modern guided editor for assignments,
  registration, attendance format, study days, pricing, and class-card content.
- Use class Study Days consistently across QR/USB scans, manual attendance,
  self-attendance, dashboards, and reports; days marked Off reject attendance.

## 0.1.44

- Preserve real student and staff scan records in dashboards and reports on weekends,
  configured days off, and holidays without generating false absence rows.

## 0.1.43

- Show student and staff attendance on the dashboard and authoritative reports as soon
  as a scan is recorded, without waiting for the active session to end.
- Continue to exclude untouched future sessions so they are not counted absent early.

## 0.1.42

- Upgrade the student USB attendance station to the proven Wattanam HID workflow with
  layout-independent QR input, buffered keyboard-scanner capture, device detection,
  non-recording scanner tests, live activity feedback, and attended-today results.

## 0.1.41

- Cast ISO timestamp parameters explicitly for student, staff, self-service, and review
  scan writes so PostgreSQL accepts them for `TIMESTAMPTZ` attendance columns.

## 0.1.40

- Keep attendance advisory-lock functions out of the SQL `FROM` relation list so the
  plugin table namespace sandbox accepts them, while casting their result for Prisma.

## 0.1.39

- Prevent Prisma `void` deserialization errors during QR scans by acquiring each
  transactional advisory lock from the SQL `FROM` clause and returning a supported integer.

## 0.1.38

- Fix camera, USB, student self-service, and staff QR scans by executing PostgreSQL
  advisory-lock SELECT statements through the transactional query API accepted by core.

## 0.1.37

- Fix student QR attendance scans on lean-core customer installations by resolving
  dated class rosters directly from Academic Management enrollment intervals instead
  of falling back to optional legacy core academic Prisma models.

## 0.1.31

- Upgrade staff attendance to a dedicated fullscreen camera/USB station with automatic GPS,
  live clock, scan feedback, vibration, and an in-session accepted-scan history.
- Add student scanner camera switching, supported-device flashlight control, audible feedback,
  vibration, durable queue state, and automatic reconnection synchronization.
- Correct first-time student self-scan responses so only actual retries are marked as
  idempotent replays.
- Add security acceptance coverage for signed-token tampering, expiration, class membership,
  role, geofence, registered-device policy, rejected retries, and exactly-once accepted scans.

## 0.1.30

- Add authoritative student and staff reporting that materializes absences only for elapsed
  expected sessions and excludes holidays, non-working days, and out-of-employment dates.
- Resolve historical student rosters per report date, honor class-specific schedules and session
  overrides, and drive report totals and dashboard class progress from the canonical server model.
- Add acceptance coverage for elapsed-session absence materialization and holiday exclusion.

## 0.1.29

- Complete the Manage Students workflow with one-step login, profile, enrollment, QR identifier,
  and ID-card creation from inside a class.
- Add real Excel template download, `.xlsx`/CSV import, Excel roster export, and row-level import
  results while retaining the bounded and validated server import pipeline.

## 0.1.28

- Add an audited, idempotent Plugin SDK 1.2 staff-account capability and create restricted
  STAFF/TEACHER logins directly from Manage Officers.
- Add the offline-first student scanner and rotating signed-QR attendance-window workspace with
  durable synchronization, live counters, recent confirmations, and automatic token rotation.

## 0.1.27

- Add a dedicated Attendance Dashboard as the first plugin menu entry with Cambodia-local date,
  live student/staff KPIs, quick actions, attention cards, roster health, and class progress.
- Add student/staff attendance distribution charts and a monthly trend panel derived from the
  canonical Academic Management attendance records.

## 0.1.26

- Add dedicated Student and Staff Attendance Report workspaces with class/date controls, daily,
  weekly, monthly, and yearly periods, session schedules, status totals, and attendance matrices.
- Add CSV export and configurable print preview with paper size, organization header, custom header
  lines, signers, and a print-ready attendance layout.

## 0.1.25

- Add Student ID Cards organized by study year and class, plus Staff ID Cards with searchable,
  printable card galleries and downloadable attendance QR images.
- Automatically create persistent, random attendance QR identifiers when students join a class
  and when officer profiles are created; safely backfill identifiers for existing students/staff.
- Enable staff identifiers in the attendance schema so printed staff cards work with the secure
  camera and USB staff-attendance scanners.

## 0.1.24

- Replace the generic attendance-record table with a dedicated Take Attendance workspace that
  loads class rosters and today’s session records, supports per-student status changes, captures
  location when permitted, and saves the complete roster.
- Add connected full-screen camera QR and USB keyboard-scanner experiences with live counters,
  scan feedback, attended-student history, automatic session selection, and the existing secure
  identifier, enrollment, time-window, holiday, role, and idempotency validation.
- Resolve scans against canonical student-profile QR codes when no separately registered
  attendance identifier exists, allowing existing student ID cards to work without duplication.

## 0.1.23

- Add dedicated Session Time Settings for class and staff attendance: quick class presets, four
  configurable check-in/out windows per scope, attendance-format rules, staff working days, save,
  and reset-to-default workflows.

## 0.1.22

- Add a dedicated Manage Officers workspace with officer/department tabs, directory filtering,
  the complete position catalog, secure officer-profile creation, printable ID cards, editing, and
  recoverable deactivation that preserves login accounts and attendance history.

## 0.1.21

- Add the dedicated Manage Classes workspace with study-year filtering, search, sorting, grid/list
  views, rich class creation, attendance schedule presets, class cards, and guarded deletion.
- Add the in-page Manage Students workflow with available-student enrollment, roster management,
  CSV sample/import/export, and links to edit student profiles.

## 0.1.20

- Replace the generic Study Years table and form with a responsive management workspace matching
  the reference UI: expandable creation form, logo upload and preview, current-year cards, class
  counts, date range, View Classes, Edit, Set Current, and guarded Delete actions.

## 0.1.19

- Split the pending attendance schema into one SQL statement per migration so Customer School's
  migration verifier can safely apply upgrades from Academic Management 0.1.15.
- Add regression coverage for both migration identity headers and the single-statement contract.

## 0.1.18

- Correct the migration identity headers for officer attendance and secure self-attendance so
  Customer School can verify and apply the 0.1.16+ schema during marketplace upgrades.

## 0.1.17

- Add short-lived Ed25519-signed student attendance windows with automatic token rotation,
  class/session binding, server-side enrollment checks, and check-in/check-out support.
- Add student self-scan, personal attendance history, registered-device policy, offline evidence,
  geofence validation, idempotency, rate limiting, full accepted/rejected audit records, and
  staff review for exceptional submissions.
- Add four-session staff card scanning with camera/USB input, server-authoritative timing,
  location capture, correction, daily records, summary/detail reports, and print/CSV/PDF UI.
- Add declarative administration pages for attendance windows, student scanning, review,
  staff scanning, and staff reporting.

## 0.1.16

- Add plugin-owned officer employment profiles linked to existing Customer School directory accounts.
- Merge the production Attendance Manager runtime and declarative UI into Academic Management,
  including manual attendance, camera/QR and USB scanning, correction review, sessions, holidays,
  identifiers, alerts, reports, printing, and CSV export.
- Map attendance tables, permissions, events, routes, jobs, navigation, and read models into the
  Academic Management namespace while sharing its canonical Study Year records.
- Add daily officer attendance and monthly officer summaries alongside the student attendance workflow.
- Preserve the core identity boundary: the plugin does not store passwords or create parallel user accounts.

## 0.1.15

- Replace the Study Years and Classes legacy-page redirects with signed declarative plugin pages.
- Add Study Year edit, set-current and guarded-delete controls and connect Class rows to their
  plugin-owned detail/roster workflow.
- Align runtime and manifest navigation for Teachers and Registration Settings.

## 0.1.14

- Restore Study Years to the Academic Management aggregate with permission-gated list, detail,
  create, edit, set-current, and guarded-delete routes backed by the existing immutable namespace.
- Open the established rich Study Years and Manage Classes interfaces from Academic plugin
  navigation, with every academic mutation routed through the plugin API namespace.
- Keep the previous Attendance and legacy paths available during the staged production cutover and
  rollback window; this release does not delete historical data or routes.

## 0.1.13

- Add a permission-gated declarative administration page for registration field modes and custom
  admission fields, backed entirely by the Academic plugin's existing owner routes.
- Allow administrators to create and remove custom fields without returning to the legacy
  registration-settings screen.

## 0.1.12

- Declare the operational contract and expose the standard runtime health probe.

## 0.1.11

- Remove duplicate Academic Study Year runtime routes. Attendance Manager is the sole lifecycle
  owner, while Academic class responses consume its versioned `study-year` read model.
- Preserve the previously published Academic Study Year migration byte-for-byte as dormant upgrade
  history; no destructive cleanup occurs during this release.

## 0.1.10

- Publish the capability-gated canonical subject lookup contract used by dependent plugins.

## 0.1.9

- Move compatibility CSV roster import behind the Academic owner route. Bounded CSV parsing,
  duplicate detection and validation now use capability-gated idempotent core account
  create/update commands while Student Profile and Enrollment writes remain plugin-owned.

## 0.1.8

- Replace approved-registration materialization through the legacy Student subscriber with the
  idempotent, capability-gated core student-account command. Academic now creates its own Student
  Profile and Enrollment Interval atomically and publishes `academic.registration.approved.v2`
  from the same durable transaction.

## 0.1.7

- Make Departments fully plugin-owned after the explicit route cutover: list/detail/create/update/delete
  now dispatch to namespaced owner routes, delete atomically clears memberships, and lifecycle events
  are durable. Add declarative Department list/create/edit management UI.

## 0.1.6

- Complete the canonical Subject management UI with a permission-gated detail lookup and
  pre-populated edit page for code, names, description, and active state.

## 0.1.5

- Route parent-directory, class-roster, bounded multi-class roster, and available-student reads
  through plugin-owned contracts in Academic plugin mode. Owner-side administrator/class-staff
  authorization and response limits prevent the compatibility controller from bypassing scope.
- Keep CSV roster import fail-closed in plugin mode until its core User-account creation is moved
  behind a dedicated identity bulk-command contract.

## 0.1.4

- Add the canonical, plugin-owned teaching-subject schema, administrator CRUD contract, bounded
  active-subject read contract, and declarative management page. Timetable schedule subjects remain
  timetable-owned; dependent plugins consume Academic subject identities instead of private SQL.
- Add deterministic, backup-bound legacy subject preflight/adoption/reconciliation and guarded
  rollback; the unified Academic cutover gate now requires its reconciled journal and exact parity.

## 0.1.3

- Add a bounded `classes/:id/document-records` source contract for Document Designer.
- Enforce class staff scope: administrators may export any class; teachers and class administrators
  may export only classes to which they are assigned.
- Apply the same scope check to class list/detail, roster list/detail and roster add/update/remove;
  orphan cleanup is administrator-only.
- Require an administrator principal for Class structure mutations and every private Admissions
  settings, field-management, registration-review, and resolution route. Permission grants alone
  cannot widen this trust boundary; authorization fails before database access.
- Publish versioned, date-validated roster, enrollment-at-date, class-audience, reverse membership,
  and class-lookup contract routes from plugin-owned data, with owner-side row scope. Core binds
  them only for the active plugin lifecycle and contains no fallback SQL to those private tables.
- Publish a self-or-administrator scoped Department-membership contract; plugin-read mode now uses
  the active plugin lifecycle binding and the core directory provider contains no private
  Department-membership SQL fallback.
- Add administrator-only, idempotent owner commands for Department assignment, guardian assignment,
  and user Academic-identity detach. Explicit plugin write-owner modes dispatch through the active
  lifecycle and fail closed after unload; Academic detach never mutates Attendance or Finance data.
- Add a bounded administrator-only batch profile contract that composes Academic-owned Department,
  Student Profile, enrollment/Class, guardian, and child relationships while resolving core names
  only through the Directory capability. Fully plugin-owned auth enrichment uses this lifecycle
  contract and validates exact response coverage.
- Minimize document records to card/certificate fields and attach explicit source/principal
  provenance without exposing email, phone, address, or unrelated academic data.

## 0.1.2

- Move class-roster reads and mutations to plugin-owned Student profiles and enrollment intervals.
- Preserve core user accounts and other plugins' records when a Student leaves a class.
- Add class-scoped Student edit/remove UI, safe row navigation, and orphan-profile cleanup.
- Route roster, enrollment, audience, class-scope, and class-lookup contracts exclusively through
  plugin-owned academic tables when plugin read ownership is enabled.
- Resolve core account identity through the `directory.read` capability and remove all runtime
  plugin SQL reads/writes against core or legacy business tables.
- Keep core name, email, and phone edits in User Management; Academic student editing now mutates
  only the plugin-owned profile.
- Consume Attendance Manager's versioned Study Year read model for class display and validation;
  remove Study Years from Academic navigation and fail closed on legacy Academic Study Year writes.
- Preserve the immutable 0.1.0 migration history through a checksum-pinned installer compatibility path.

## 0.1.1

- Add Study Year, Class, enrollment, admissions, roster, and student-management foundations.
- Publish versioned lifecycle events through the durable outbox and core event bus.
- Derive retry-stable event idempotency keys from mutation content rather than wall-clock time.
- Add declarative academic administration pages and dependent roster/enrollment contracts.
- Add an isolated academic Student profile table keyed by stable core user ID; production routing
  remains on the legacy profile until adoption and reconciliation are certified.

## 0.1.0

- Add the initial department and user-department namespace.
- Add read-only department list route and declarative UI; mutation routes are withheld until
  authoritative-write or dual-write consistency is certified.
- Reserve granular view and manage permissions.
