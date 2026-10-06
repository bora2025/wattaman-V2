# Changelog

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
