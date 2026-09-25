# Timetable plugin extraction worksheet

Status: plugin UI parity and local legacy-data adoption/rollback toolkit implemented;
real-PostgreSQL execution and legacy cutover remain open.

Source: [Module-to-Plugin Migration Plan](./module-to-plugin-migration-plan.md), MP-3.

## Ownership boundary

`wattanam.timetable` owns timetable documents, subjects, timetable-local classes, classrooms, teacher scheduling profiles, lessons, schedule entries, generation, schedule reports and teacher presence for scheduled lessons. ADR-0019 explicitly assigns `TimetableTeacherAttendance` to Timetable; the older worksheet wording that sent it to Attendance Manager was incorrect. Timetable 0.1.3 adds its namespaced lesson-attendance table plus optional `directoryUserId` and `academicClassId` identifiers, validates new identifiers through the capability-gated core/Academic directory, and retains local names as historical snapshots. It uses no cross-plugin SQL or foreign keys. Existing adopted rows remain nullable until an operator maps them.

## Legacy inventory reviewed

| Surface | Current location | Target |
| --- | --- | --- |
| Timetable CRUD, subjects, classes, classrooms, teachers, lessons, entries and greedy generation | `backend/src/timetable/timetable.controller.ts`, `timetable.service.ts` | Timetable plugin API, data and jobs |
| Timetable, Subject, Class, Classroom, Teacher, Lesson, Entry | `backend/prisma/schema.prisma` | Seven plugin-namespaced tables; leave old tables unchanged during rollback window |
| Teacher lesson attendance and QR scan | Same service, `TimetableTeacherAttendance` model | Timetable, using its stable teacher-directory identifier; never mix with staff employment attendance |
| Main wizard and schedule editor | `frontend/app/admin/timetable/page.tsx` | Shared trusted host workspace in plugin mode, using only plugin-owned API routes |
| Subjects, classes, classrooms, teachers, lessons, schedule | `frontend/app/admin/timetable/*/page.tsx` | Shared trusted host pages in plugin mode, preserving the existing workflows |
| Teacher lesson-attendance page | `frontend/app/admin/timetable/teacher-attendance/page.tsx` | Shared trusted workspace entered through `/plugins/wattanam.timetable/teacher-attendance`; plugin mode uses namespaced APIs only |
| Wattaman teacher scanner and scheduled-teacher directory | `frontend/app/wattaman/teacher-scan/page.tsx`, `scheduled-teacher/page.tsx` | Shared trusted workspaces entered through plugin-owned routes; scan, directory and teacher-update calls use namespaced plugin APIs |

The legacy API also exposes scheduled-teacher lookup and teacher monthly reports. Search all consumers before routing or removing them. The old generator clears entries before rebuilding and does not prevent teacher or room collisions across classes; preserve data until a replacement with explicit conflict checks and rollback is tested.

## Implemented first slice

`plugins/wattanam.timetable/` has a valid manifest, immutable migration identities/checksums, eight namespaced scheduling/lesson-attendance tables, permission-gated CRUD routes, a collision-safe generator with preview, declarative fallback pages, and the existing rich timetable workspace operating in plugin mode. The workspace retains the wizard, edit/delete flows, drag-and-drop schedule, printing and exports, but all timetable reads and mutations are translated to namespaced plugin endpoints. Version 0.1.0 is published; the shared rich UI and response-shape compatibility were prepared as 0.1.1, 0.1.2 added the directory-reference boundary, and 0.1.3 adds the ADR-owned lesson-attendance schema plus transactional mark/QR-scan and range/monthly report routes with separate view/manage permissions. Plugin-owned entry routes now also cover the Wattaman teacher scanner and scheduled-teacher directory; their scanner, directory and edit requests are translated through the same namespaced adapter. Existing-school production adoption, hosted UI parity, proxy cutover and removal of the legacy module remain deliberately open.

The entry-update boundary now validates the complete resulting entry against its lesson, including retained fields in a partial PUT. Focused regression tests cover changing only the teacher and changing only the lesson ID. Generator preview/save also enforces time-off windows, `maxOnDay` and structured same-subject-per-day limits deterministically, failing closed on malformed configuration and preserving the atomic stale-input check. This is local source validation, not a published release or the real-PostgreSQL certification required below.

## Remaining gates before cutover

1. Define stable teacher/class/academic-year references and Attendance Manager handoff, including scans and reports.
2. Certify CRUD, same-timetable referential checks and row-scope permissions against real PostgreSQL, including concurrent edits and deletion restrictions.
3. Certify the locally complete generator behavior—deterministic preview, collision checks,
   time-off, daily/distribution constraints, incomplete-plan refusal and atomic stale-input commit—
   on real PostgreSQL and timetable-shaped data.
4. Certify the shared trusted-host UI in plugin mode across supported browsers and devices. Arbitrary plugin JavaScript remains prohibited; the package retains declarative fallback pages.
5. Execute the completed local adoption toolkit on restored PostgreSQL. Its privacy-safe
   eight-dataset preflight, verified-backup binding, guarded dry-run, resumable idempotent copy,
   exact reconciliation and metadata-only rollback pass focused tests
   ([evidence](../acceptance/mp4-timetable-adoption-preflight-2026-09-25.md)). Keep legacy tables
   untouched.
6. Certify clean install, package signature, permissions, activate/deactivate, update, remove/reinstall, backup/restore, migration on a real PostgreSQL instance, and role/device/browser workflows.
7. Only then switch legacy routes to thin plugin proxies, remove old navigation when the plugin is absent, and later remove legacy tables after the approved support window.
