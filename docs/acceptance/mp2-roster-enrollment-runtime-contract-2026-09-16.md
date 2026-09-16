# MP2 Roster and Enrollment Runtime Contract — Local Evidence

Date: 2026-09-16
Status: partial MP2-004 foundation

Academic Directory now publishes a typed read-only contract identified as
`wattanam.academic-management.roster` version `1.0.0`:

- `getClassRoster(classId, asOfIsoDate)` returns a deterministic student projection needed by
  Attendance: student ID, account ID, student number, display name and parent ID.
- `getEnrollmentAtDate(studentId, asOfIsoDate)` returns current class membership with an explicit
  `legacy-current-membership` source marker.
- Directory Service delegates both methods and fails closed if its Academic provider does not
  implement contract v1.

The caller must provide an ISO school date. The provider resolves today's date in the installed
school timezone. It rejects malformed dates and every historical date before querying membership,
because the current legacy `Student.classId` schema has no enrollment interval history. This is an
intentional safety limit: Attendance must not infer historical roster membership from today's row.

Verification: 22/22 focused Directory/provider tests pass; backend TypeScript checking passes.

Open before Attendance extraction: namespaced enrollment interval schema, adoption/reconciliation,
plugin-runtime adapter, authorization and row-scope tests, enrollment lifecycle/outbox events,
restored-backup execution, and dependent Attendance contract tests.
