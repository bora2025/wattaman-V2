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

## MP2-008 dependent service contract consumption

- `backend/scripts/mp2-dependent-fixtures.test.js` proves that Attendance, Timetable, Exam,
  Learning and Finance fixtures consume `getClassRoster` / `getEnrollmentAtDate` without touching
  `Student`/`Class` tables (6/6 passing).
- `FeesService.getStudents()` now resolves current enrollment through
  `DirectoryService.getEnrollmentAtDate()` instead of joining `Student`/`Class`; boundary spec
  passes (2/2).
- `AttendanceService` now validates membership through the roster contract:
  - `recordAttendance` uses `DirectoryService.getClassRoster()` and fails closed when the student
    is not on the roster.
  - `recordBulkAttendance` builds its student map from the roster contract instead of
    `prisma.student.findMany`.
  - `getStudentAttendanceRecords` enumerates the class roster through the contract instead of
    `prisma.student.findMany`.
  - `getUserDailyAttendance` resolves student class membership via `DirectoryService.classesForUser`
    and `getClassRoster()` instead of `prisma.student.findUnique`.
    - `wattamanScan` resolves the student identifier via lean `Student` queries, then validates
      current class membership through `DirectoryService.getEnrollmentAtDate()` and
      `getClassRoster()` instead of reading `Student.class`/`Student.user`. Class schedule for
      day-off checks is reserved for a future class-schedule contract.
    - Focused boundary spec passes (9/9).
- Full backend Jest suite: 515 tests pass; the only 3 failures are pre-existing unrelated failures
  in `plugin-security-fixtures.spec.ts` and `marketplace-commerce.service.spec.ts`.

Open before Attendance extraction: namespaced enrollment interval schema, adoption/reconciliation,
plugin-runtime adapter, authorization and row-scope tests, enrollment lifecycle/outbox events,
restored-backup execution, and any remaining Attendance paths that still read `Student` directly
after the `wattamanScan` identifier resolution step.
