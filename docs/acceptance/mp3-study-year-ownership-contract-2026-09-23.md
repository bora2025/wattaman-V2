# MP-3 Study Year ownership and Academic consumer contract

Date: 2026-09-23  
Scope: local ownership and runtime-contract verification

## Decision reconciled

The authoritative ownership manifest and the module migration plan assign Study Years to
Attendance Manager because they define the attendance calendar boundary. Academic Management is a
consumer. Earlier MP-2 implementation temporarily made Academic Management a second writer; that
state is now fail-closed and no longer used by the core compatibility route.

## Implemented boundary

- Core `/study-years` compatibility routes dispatch to `wattanam.attendance-manager` in plugin mode.
- `ATTENDANCE_STUDY_YEARS_ROUTE_OWNER` is the canonical switch; the old
  `ACADEMIC_STUDY_YEARS_ROUTE_OWNER` name remains a temporary operator compatibility alias.
- Attendance Manager supplies list/current/detail/create/update/set-current/delete routes.
- Attendance Manager publishes versioned `study-year` read models on activation and mutations.
- Every Attendance-owned Study Year mutation also publishes a versioned transient lifecycle event
  (`attendance.study-year.{created|updated|set-current|deleted}.v1`) and persists the corresponding
  `wattanam.attendance-manager.study-year.*` event transactionally to the durable outbox with a
  deterministic idempotency key.
- Academic class responses resolve their opaque `studyYearId` through that read model and validate
  new references against it; they no longer join the duplicate Academic Study Year table.
- Academic Study Year mutation routes fail closed and its navigation entry is removed. The old
  migration/table is retained as rollback data until the approved support window closes.
- Attendance deletion publishes a tombstone read model, and Academic consumers ignore tombstones.
- The guarded legacy adoption toolkit now targets Attendance Manager's table, uses a distinct
  Attendance journal identity/path, requires the new Attendance confirmation variables, and keeps
  the old variable names only as transition aliases.
- Unified Academic cutover readiness requires both Academic Management and Attendance Manager to
  be active and verifies Study Year parity against the Attendance-owned target.

## Verification

- Study Year compatibility controller and strict Attendance runtime suites: 5/5 passed, including
  all four durable and transient Study Year lifecycle event paths.
- Academic reference suite: 7/7 passed, including owner fail-close and read-model consumption.
- Attendance Study Year preflight/adopt/rollback suites: 9/9 passed.
- Unified cutover-readiness suite: 3/3 passed with dual-plugin activation checks.
- Architecture inventory gate: 1,430 discovered items owned; 82 models classified.
- Backend production build passed.

## Remaining gate

Execution of the toolkit against a restored real PostgreSQL backup and hosted lifecycle proof
remain open. Until those pass, production route ownership must remain `legacy` and the legacy and
Academic rollback tables must not be deleted.
