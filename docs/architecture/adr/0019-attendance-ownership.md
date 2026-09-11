# ADR-0019: Attendance Ownership

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-012**.

## Context

"Attendance" in the current code is four different business records, spread across several modules and one mobile screen:

| Record | Current models | What it records |
|---|---|---|
| School-day attendance | `Attendance`, `SessionConfig`, `Holiday`, `CardAlias`, `AttendanceFormatRule` | A student present, late or absent for a school session |
| Staff attendance | `StaffAttendance`, `StaffWeeklySchedule` | An employee's daily presence, including self-scan |
| Lesson attendance | `TimetableTeacherAttendance` | A teacher present for a scheduled timetable lesson |
| Course-session attendance | `CourseSession`, `CourseAttendance` | A learner checked in to a course meeting |

The migration plan gives three of the four a clear owner. School-day attendance goes to Attendance. Staff attendance goes to Human Resources, with Attendance possibly providing a shared engine (10.1). Course-session attendance goes to Learning (10.1). For lesson attendance, section 4 says Attendance, even though the plan sends all other staff attendance to Human Resources.

## Decision

1. **School-day attendance belongs to `wattanam.attendance`**. That includes scanning, corrections, sessions, holidays, student card aliases, absence alerts, and student attendance reports and exports.
2. **Staff attendance belongs to `wattanam.human-resources`, with no dependency on Attendance.**
   - Employee self-scan, staff corrections, staff session defaults, the staff weekly schedule and staff reports all move to Human Resources.
   - Scanning is a core UI input ([ADR-0011](./0011-plugin-ui-declarative-v2.md)), and card readers used by both plugins register through a core device contract (migration plan 6.2).
   - The plan's "shared attendance engine" is not adopted: it would make Human Resources depend on Attendance and, through it, on Academic Management.
3. **Lesson attendance belongs to `wattanam.timetable`.** This departs deliberately from migration plan section 4:
   - the record only has meaning against Timetable's own lessons and teachers;
   - its screens already call timetable endpoints;
   - leaving it in Timetable removes the attendance-to-timetable dependency LC-1 found.

   If payroll needs lessons taught, Human Resources receives them through a versioned contract.
4. **Course-session attendance belongs to `wattanam.learning`.**
5. **The four records are never mixed.** Each keeps its own tables, permissions and reports, and the product uses the four names above consistently.

## Consequences

- Human Resources installs with only core, as the catalog intends: a school can track staff without buying student attendance.
- A school without Timetable has no lesson attendance, which is correct: it has no scheduled lessons.
- The mobile scanner screen (`apps/mobile/src/screens/ScannerScreen.tsx`) splits: student scanning goes to Attendance, and employee self-scan to Human Resources.
- Teachers have two presence records, one daily (Human Resources) and one per lesson (Timetable), and the screens must label them clearly.

## Alternatives considered

- **Lesson attendance to Attendance** (migration plan section 4). One plugin for everything called attendance, but Attendance would then hold staff data and depend on Timetable, whose endpoints its screens call today.
- **Lesson attendance to Human Resources.** All staff presence in one place for payroll, but Human Resources would then depend on Timetable.
- **One Attendance plugin for students and staff.** The simplest to extract, but a school tracking only staff would need the whole academic stack, and employee records would sit in a student plugin.

## Evidence from LC-1

- 131 provisional items: 1 module, 5 models, 1 controller, 67 routes, 17 pages, 16 navigation entries and 24 files.
- Five split plans fall under this decision:

  | Split plan | Items | Owners |
  |---|---|---|
  | `attendance-staff` | 27 | 17 Attendance, 10 Human Resources |
  | `session-config-staff` | 14 | 11 Attendance, 3 Human Resources |
  | `timetable-teacher-attendance` | 34 | 28 Timetable, 6 Attendance |
  | `reports-by-domain` | 32 | 18 Attendance, 10 Human Resources, 2 core, 1 Academic Management, 1 Reporting |
  | `mobile-scanner` | 1 | 1 Attendance |

- The largest undeclared dependency is Attendance to Human Resources: 60 references, 48 of them inside split plans. Attendance to Timetable has 6 references, including a foreign key.

## On acceptance

The `timetable-teacher-attendance` split dissolves and its 6 Attendance items move to Timetable. The remaining `LC0-012` references are removed, making the 131 owners final.

## Related

[Migration plan 5.5, 10.1](../module-to-plugin-migration-plan.md) · [Lean-core plan section 8](../wattanam-lean-core-plugin-first-plan.md) · [Student self-attendance plan](../../student-self-attendance-plan.md)
