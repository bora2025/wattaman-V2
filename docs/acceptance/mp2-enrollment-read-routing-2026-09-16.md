# MP2 Enrollment Read Routing — Local Evidence

Date: 2026-09-16
Status: reversible local read path; production cutover not approved

`ACADEMIC_ROSTER_READ_OWNER` controls the Academic Directory roster/enrollment adapter:

- unset or `legacy`: current-day reads use legacy `Student.classId`; historical dates fail closed.
- `plugin`: reads select the namespaced enrollment interval covering the requested inclusive date.

Plugin reads run in a repeatable-read transaction. They reject overlapping intervals and missing
student profiles. For the current school-local date, the provider compares interval membership
against legacy membership and fails closed on any drift. Historical reads use interval membership
without incorrectly comparing it with today's legacy class. The returned contract identifies its
source as either `legacy-current-membership` or `plugin-enrollment-interval`.

Verification: 9/9 focused provider tests pass, the combined Directory suite passes 25/25, and
backend TypeScript checking passes.

Rollback is metadata-only and is now guarded by the explicit, backup-bound enrollment rollback
drill ([local evidence](./mp2-enrollment-rollback-drill-2026-09-25.md)). Do not set `plugin` on a
live school until migration 003 is installed, enrollment adoption is reconciled against a verified
restored backup, and a live parity report passes. The interval table currently contains only
adopted current memberships unless authoritative historical intervals are imported later.
