# Reporting plugin extraction worksheet

Status: local foundation implemented, not cut over or production-certified  
Plugin: `wattanam.reporting`  
Version: `0.1.1`

## Boundary

Reporting is a read-only composition plugin. It owns cross-module dashboards and exports, but it
does not own any source-domain records. Academic Management provides the dated class roster; all
optional domain values arrive through versioned, student-keyed read models.

The first report combines these minimized contracts:

| Owner | Read model | Data used |
| --- | --- | --- |
| Attendance Manager | `student-attendance-summary` v1 | present/late/absent counts |
| Finance | `student-fee-balance` v1 | balance per currency |
| Examination | `student-grade-summary` v1 | gradebook/attempt counts |
| Transportation | `student-transport-summary` v1 | current vehicle name |
| Communication | `student-communication-summary` v1 | unread count |

The staff report uses Directory to enumerate a bounded staff identity set, drops contact details,
and reads Human Resources' `staff-attendance-summary` v1 projection in bulk. It presents only the
selected date's status counts and recorded-session total.

## Safety rules

- Only school-administrator roles may execute the report.
- The dated Academic roster defines the allowed student set.
- Every read-model query is keyed to that set and capped at 500 students.
- Optional plugin/read-model failure produces an empty section instead of failing the report.
- Source details such as scanner identifiers, receipt details, answers, location history and message
  content are never returned.
- Reporting has no database capability and no migrations.
- CSV/PDF/print output uses the host declarative UI; the API also provides a BOM-prefixed,
  correctly escaped CSV response for automation.

## Remaining certification work

- Exercise bulk keyed reads against real PostgreSQL with mixed available/disabled plugins.
- Verify administrator authorization and absence of student/teacher access in a hosted browser.
- Compare the new report against approved legacy report totals on a restored backup.
- Install, disable, enable, update, remove and reinstall the marketplace package on clean core.
- Run backup/restore and production observability checks.
- Cut over and remove legacy cross-feature reporting only after the rollback window is approved.
