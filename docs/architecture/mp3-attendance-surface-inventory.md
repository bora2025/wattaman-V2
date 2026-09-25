# MP-3 Attendance Surface Inventory

Status: **Complete inventory; implementation and certification remain open**  
Inventory date: 2026-09-25  
Decision authority: [ADR-0019](./adr/0019-attendance-ownership.md)

This document is the freeze baseline for MP3-001. It inventories the current legacy Attendance
surface and assigns every item to its final owner before cutover. An inventory entry does not mean
that the plugin already owns or certifies that behavior.

## 1. Authoritative ownership split

| Business record | Final owner | Included behavior |
|---|---|---|
| Student school-day attendance | `wattanam.attendance-manager` | student marking/scanning, class sessions, holidays, student identifiers, corrections, alerts, student reports/print/export and Study Years |
| Employee daily attendance | `wattanam.human-resources` | staff marking/self-scan, staff corrections, staff schedule/session defaults and staff/employee reports |
| Teacher lesson attendance | `wattanam.timetable` | scheduled-teacher scan, lesson presence and timetable teacher reports |
| Course-session attendance | `wattanam.learning` | course meeting check-in and course attendance views |

The four records must not share tables, permissions or reports. Core supplies authentication,
authorization/audit, device input, notifications, realtime transport, jobs and storage capabilities;
it owns no attendance business policy.

## 2. Legacy backend API inventory

### Student school-day attendance -> Attendance Manager

| Legacy controller | Routes/behavior to replace |
|---|---|
| `backend/src/attendance/attendance.controller.ts` | `POST /attendance/record`, `POST /attendance/bulk`, `POST /attendance/check-out`, `GET /attendance/records`, `PATCH /attendance/update`, `PATCH /attendance/edit-permission-type`, `POST /attendance/create-record`, `DELETE /attendance/record`, `GET /attendance/user-daily`, `POST /attendance/wattaman/scan` |
| `backend/src/card-aliases/card-aliases.controller.ts` | list, student list, resolve, create and delete under `/card-aliases` |
| `backend/src/session-config/session-config.controller.ts` | class/global session reads and writes, class format rules; staff schedule/default endpoints are excluded below |
| `backend/src/holidays/holidays.controller.ts` | list, date check, create, update and delete under `/holidays` |
| `backend/src/study-years/study-years.controller.ts` | list/current/create/update/set-current/delete under `/study-years`; compatibility proxy already targets Attendance Manager |
| `backend/src/reports/reports.controller.ts` | class progress, monthly trend, student summary/detail/grid/totals, student CSV/XLSX exports and student print data |

### Explicitly excluded backend behavior

| Legacy surface | Final owner |
|---|---|
| `/attendance/staff/*`, `/attendance/employee/*`, staff create/update/delete and staff permission edits | Human Resources |
| `/session-config/staff`, `/session-config/staff-schedule` and staff-scoped format rules | Human Resources |
| `/reports/staff-*`, `/reports/export-staff-*`, `/reports/employee/*`, staff print/export | Human Resources |
| `backend/src/timetable` teacher-attendance and scheduled-teacher routes | Timetable |
| course attendance routes and services | Learning |
| reports `system-status` and `audit-logs` | lean core |
| reports `dashboard-summary` | Reporting |
| reports `duplicate-students` | Academic Management |

## 3. Data inventory

| Legacy model/table | Final owner | Migration treatment |
|---|---|---|
| `StudyYear` | Attendance Manager | adopt into namespaced Study Year table; keep legacy rollback copy |
| `Attendance` | Attendance Manager | adopt records plus immutable display snapshots and reconciliation totals |
| `SessionConfig` (class/global) | Attendance Manager | split staff rows before adoption |
| `Holiday` | Attendance Manager | adopt with creator identity retained |
| `CardAlias` for students | Attendance Manager | adopt as student identifiers; never copy staff credentials |
| `AttendanceFormatRule` (class scope) | Attendance Manager | split staff rules before adoption |
| `StaffAttendance`, `StaffWeeklySchedule` | Human Resources | never copy into Attendance Manager |
| `TimetableTeacherAttendance` | Timetable | never copy into Attendance Manager |
| `CourseAttendance` | Learning | never copy into Attendance Manager |

The current plugin migration has Study Year, session, holiday, identifier and record tables. MP3-003
must add immutable migrations for correction history, scan/idempotency ledger, alert state and required
snapshot fields. Published migrations `001` and `002` are checksum-pinned and must not be edited.

## 4. Web UI and navigation inventory

### Attendance Manager

- `/admin/attendance`, `/admin/attendance/edit`, `/admin/camera`, `/admin/holidays`,
  `/admin/session-settings`, `/admin/reports`, `/admin/reports/print`, `/admin/study-years`.
- `/teacher/attendance`, `/teacher/reports`, `/teacher/session-settings`.
- `/parent/attendance` as a parent-scoped read projection.
- `/wattaman/scan` and `/wattaman/usb-scan` for student scanning.
- `frontend/lib/offline-attendance.ts`, the student portion of `frontend/lib/admin-nav.ts`, and
  attendance-specific translations/components used by those pages.

### Excluded web UI

- `/admin/staff-attendance*`, `/admin/staff-reports*`, `/teacher/staff-attendance`,
  `/teacher/staff-reports`, `/employee/scan`, `/employee/reports`: Human Resources.
- `/admin/timetable/teacher-attendance`, `/wattaman/teacher-scan`,
  `/wattaman/teacher-reports*`: Timetable.
- `/teacher/courses/[id]/attendance`, `/student/courses/[id]/attendance`: Learning.
- `/reporter`: Reporting composition; it consumes domain read models and must not query domain tables.

Legacy navigation entries must disappear in lean-core distribution. Installed plugins register their
own entries and permissions; uninstall/disable must remove them without leaving broken routes.

## 5. Mobile inventory

| Screen | Final owner/action |
|---|---|
| `EditAttendanceScreen.tsx` | split: student editing to Attendance Manager; staff editing to Human Resources |
| `ScannerScreen.tsx` | split: student camera/QR scan to Attendance Manager; employee self-scan to Human Resources |
| `ReportsScreen.tsx` | Attendance Manager student reports |
| `HolidaysScreen.tsx` | Attendance Manager |
| `SessionSettingsScreen.tsx` | split class settings to Attendance Manager and staff settings to Human Resources |
| `StaffAttendanceScreen.tsx`, `StaffReportsScreen.tsx`, `MyReportsScreen.tsx` | Human Resources |

Plugin-driven mobile delivery, deep links, offline queue compatibility and minimum app versions are
certification work under MP3-010/014/015, not evidence supplied by this inventory.

## 6. Realtime, jobs, notifications, files and devices

| Area | Legacy baseline | Target boundary |
|---|---|---|
| Realtime | `AttendanceGateway` rooms `class-*`/dashboard and event `attendanceUpdate` | Attendance publishes versioned domain events; core realtime capability performs authorized delivery and stops on disable/suspension |
| Offline | IndexedDB queue in `frontend/lib/offline-attendance.ts` posts Wattaman scans | every queued scan carries an idempotency key and is safe to retry |
| Jobs | no Attendance-owned cron/processor was found in the frozen backend surface | alert/digest jobs, if added, register through core jobs with retry, suspension and disable semantics |
| Notifications | no dedicated legacy absence notification workflow was found | alert policy/state belongs to Attendance; delivery uses core notification adapters, preferences, quota and audit |
| Files | CSV/XLSX generation and browser print pages are generated outputs; no mutable attendance upload store was found | plugin owns report/export policy; core storage/streaming capability handles files where needed |
| Devices | browser/mobile camera QR, USB keyboard wedge, student card aliases, optional GPS | core device input contract; Attendance owns student scan authorization, duplicate/session/timezone/clock policy |

## 7. Current plugin delta (not completion evidence)

`plugins/wattanam.attendance-manager` 0.1.2 currently provides namespaced Study Year, session,
holiday, identifier and record storage; basic records/scan/summary routes; declarative navigation;
and Study Year events/read model. It is not yet parity-complete because it lacks the correction,
scan-ledger, alert and snapshot schema; the full permission/row-scope matrix; legacy route/UI
cutover; report/print parity; adoption; real-device proof; and production lifecycle certification.

The package text and generic `personType` schema currently mention or permit staff/teacher records.
MP3-002 must narrow this to student school-day attendance. Existing staff or teacher paths must move
to their ADR owners rather than become an accidental compatibility promise.

## 8. MP3 follow-on acceptance map

| Inventory finding | Required checklist item |
|---|---|
| ownership/package mismatch | MP3-002 |
| missing corrections/scans/alerts/snapshots | MP3-003/004 |
| roster and enrollment lookups | MP3-005 |
| fragmented manual/camera/USB/offline commands | MP3-006/007 |
| incomplete grants and actor/data scopes | MP3-008/009 |
| legacy web/mobile UI and reports | MP3-010/011 |
| realtime/alert lifecycle | MP3-012 |
| legacy data | MP3-013 |
| actual camera/QR/card/USB hardware | MP3-014 |
| install/update/disable/restore/pilot | MP3-015 |

MP3-001 is complete when this inventory and ADR-0019 agree. It does not waive the MP-2 hosted pilot
prerequisite or permit production cutover before MP3-002 through MP3-015 are evidenced.
