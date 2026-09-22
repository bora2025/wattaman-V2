# Timetable plugin extraction worksheet

Status: plugin UI parity implemented for new installations; existing-school adoption and legacy cutover remain open.

Source: [Module-to-Plugin Migration Plan](./module-to-plugin-migration-plan.md), MP-3.

## Ownership boundary

`wattanam.timetable` owns timetable documents, subjects, timetable-local classes, classrooms, teacher scheduling profiles, lessons, schedule entries, generation and schedule reports. It must not own attendance events. `TimetableTeacherAttendance` and the `teacher-attendance/*` routes/pages require transfer to Attendance Manager under a documented teacher-identity contract before cutover. Timetable teacher profiles currently duplicate core `User` identity; use stable references and snapshots, not cross-plugin SQL or foreign keys.

## Legacy inventory reviewed

| Surface | Current location | Target |
| --- | --- | --- |
| Timetable CRUD, subjects, classes, classrooms, teachers, lessons, entries and greedy generation | `backend/src/timetable/timetable.controller.ts`, `timetable.service.ts` | Timetable plugin API, data and jobs |
| Timetable, Subject, Class, Classroom, Teacher, Lesson, Entry | `backend/prisma/schema.prisma` | Seven plugin-namespaced tables; leave old tables unchanged during rollback window |
| Teacher attendance and QR scan | Same service, `TimetableTeacherAttendance` model | Attendance Manager; cross-plugin scheduling/teacher contract needed |
| Main wizard and schedule editor | `frontend/app/admin/timetable/page.tsx` | Shared trusted host workspace in plugin mode, using only plugin-owned API routes |
| Subjects, classes, classrooms, teachers, lessons, schedule | `frontend/app/admin/timetable/*/page.tsx` | Shared trusted host pages in plugin mode, preserving the existing workflows |
| Teacher attendance page | `frontend/app/admin/timetable/teacher-attendance/page.tsx` | Attendance Manager |

The legacy API also exposes scheduled-teacher lookup and teacher monthly reports. Search all consumers before routing or removing them. The old generator clears entries before rebuilding and does not prevent teacher or room collisions across classes; preserve data until a replacement with explicit conflict checks and rollback is tested.

## Implemented first slice

`plugins/wattanam.timetable/` has a valid manifest, immutable migration identities/checksums, seven namespaced scheduling tables, permission-gated CRUD routes, a collision-safe generator with preview, declarative fallback pages, and the existing rich timetable workspace operating in plugin mode. The workspace retains the wizard, edit/delete flows, drag-and-drop schedule, printing and exports, but all timetable reads and mutations are translated to namespaced plugin endpoints. Version 0.1.0 is published; the shared rich UI and response-shape compatibility are prepared as 0.1.1. Existing-school data adoption, proxy cutover and removal of the legacy module remain deliberately open.

## Remaining gates before cutover

1. Define stable teacher/class/academic-year references and Attendance Manager handoff, including scans and reports.
2. Certify CRUD, same-timetable referential checks and row-scope permissions against real PostgreSQL, including concurrent edits and deletion restrictions.
3. Certify generator dry-run, deterministic results, collision checks and atomic commit on real timetable-shaped data; add explicit time-off/distribution constraints before parity is claimed.
4. Certify the shared trusted-host UI in plugin mode across supported browsers and devices. Arbitrary plugin JavaScript remains prohibited; the package retains declarative fallback pages.
5. Build a journaled adoption tool with read-only preflight, backup, copy, relation/count/hash reconciliation, and rollback on a restored database. Keep legacy tables untouched.
6. Certify clean install, package signature, permissions, activate/deactivate, update, remove/reinstall, backup/restore, migration on a real PostgreSQL instance, and role/device/browser workflows.
7. Only then switch legacy routes to thin plugin proxies, remove old navigation when the plugin is absent, and later remove legacy tables after the approved support window.
