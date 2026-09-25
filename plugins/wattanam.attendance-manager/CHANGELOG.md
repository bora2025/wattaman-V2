# Changelog

## 0.1.6

- Preserve legacy permission date ranges and student attendance-format policy in additive plugin
  storage before historical adoption.
- Add a read-only, PII-safe preflight that inventories and fingerprints Study Years, class sessions,
  holidays, student identifiers, student format rules and attendance records while explicitly
  excluding staff, lesson and course attendance.

## 0.1.5

- Add row-scoped daily grid, student detail, monthly trend, class progress, snapshot print and UTF-8
  CSV projections with declarative report filters.
- Add absence-alert rule management, a suspension-aware scheduled evaluator, in-app and namespaced
  realtime delivery, alert acknowledgement and declarative alert history.
- Add an immutable per-recipient/channel delivery ledger so a failed multi-recipient run can retry
  without resending deliveries that already succeeded.

## 0.1.4

- Add immutable correction history, idempotent scan ledger, absence-alert rules/delivery state, and
  historical person/class/Study Year snapshot fields.
- Store only a scan-code hash in the ledger; raw identifiers remain in the separately protected
  identifier table and are not duplicated into operational telemetry.
- Validate every write against Academic Management's dated roster contract and snapshot the student
  name/number, class name and Study Year label without querying another plugin's tables.
- Route camera/QR/card and USB scans through one advisory-locked idempotent command whose attendance
  write, durable event and hashed-code scan ledger commit atomically.
- Enforce operator role, IANA school timezone, active-session, holiday, offline-age and future-clock
  policies on the server; scanner-provided status/date/time can no longer override those policies.
- Replace coarse administration grants with explicit view, scan, mark, correct, report, print,
  configure and device-management permissions; retain `manage`/`export` declarations only so old
  installations can migrate grants deliberately.
- Add atomic corrections with immutable before/after history and dedicated permission-gated print
  data and CSV summary routes.
- Apply one Academic-contract-backed class/student/parent row-scope policy to attendance mutations,
  corrections, reads, reports, print data and exports.

## 0.1.3

- Enforce ADR-0019: Attendance Manager accepts and returns student school-day attendance only.
- Reject new teacher/staff records, identifiers and session settings while preserving any historical
  excluded rows for migration export and rollback.
- Clarify that employee, lesson and course-session attendance belong to their domain plugins.

## 0.1.2

- Preserve the immutable 0.1.0 schema migration and Academic Management dependency.
- Support the published headerless, multi-statement migration through the core installer's exact
  plugin/migration/SHA-256 compatibility rule; its DDL runs as individual statements inside the
  installation transaction and modified packages remain rejected.
- Make all write handlers conform to the production database capability: transactional execute,
  namespaced result readback, and no mutation sent through the read-only query method.
- Become the single Study Year writer, publish versioned Study Year read models, and provide the
  full compatibility-route CRUD contract consumed by core and Academic Management.

## 0.1.0

- Add the initial namespaced Study Year, session, holiday, scan-identifier, and attendance-record
  schema together with scanner, reporting, and administration foundations.
