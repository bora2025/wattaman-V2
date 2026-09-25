# MP-2 academic route and page ownership inventory

Status: complete inventory of the current legacy compatibility surface, 2026-09-25.

This inventory identifies ownership; it does not claim that every compatibility route has cut over
or that legacy code can be removed. The accepted machine-readable owner remains
[`ownership-manifest.json`](./ownership-manifest.json).

## Backend HTTP surfaces

| Legacy controller | Routes currently present | Target owner | Migration disposition |
| --- | --- | --- | --- |
| `classes` | `POST /classes`; `GET /classes`; `GET /classes/parents`; `PUT /classes/:id`; `GET /classes/:id/students`; `GET /classes/students/batch`; `PATCH /classes/:classId/students/:studentId`; `POST /classes/:id/students`; `POST /classes/:id/students/bulk-csv`; `DELETE /classes/:id`; `POST /classes/cleanup-orphaned-students`; `DELETE /classes/:id/students/:studentId`; `GET /classes/:id/available-students` | Academic Management | Standard CRUD, parent directory, single/bounded-batch roster, available-student, and roster-mutation operations have plugin contracts. CSV import remains fail-closed because it creates core accounts and requires a dedicated core identity bulk-command contract. |
| `departments` | `GET /departments`; `POST /departments`; `PUT /departments/:id`; `DELETE /departments/:id` | Academic Management | Department structure and user-membership contracts belong to Academic Management. Core Directory retains only generic identity lookup. |
| `class-registrations` | `GET public/classes`; `GET public/form-config`; `POST public`; `GET/PATCH settings`; `GET/POST fields`; `PATCH fields/reorder`; `PATCH/DELETE fields/:id`; `GET unread-count`; `GET /`; `PATCH /:id` | Academic Management | Public admissions, settings, field management, registration review, and resolution belong to Academic Management. Compatibility controllers dispatch or fail closed according to the route-owner switch. |
| `study-years` | `GET /`; `GET current`; `POST /`; `PUT /:id`; `POST /:id/set-current`; `DELETE /:id` | Attendance Manager | Study Year was corrected to the Attendance owner. Academic consumes its read model and has no active Study Year write ownership. |

## Compiled frontend surfaces

| Current page | Target owner | Plugin replacement/disposition |
| --- | --- | --- |
| `/admin/classes` and `/admin/classes/[id]` | Academic Management | Declarative Classes and Class Students pages; legacy pages remain only for compatibility/rollback. |
| `/admin/class-registrations` | Academic Management | Declarative registration list/detail/resolve pages. |
| `/admin/students` | Academic Management | Student roster/detail editing is plugin-owned; generic account/contact editing remains core User Management. |
| `/admin/teachers` | Academic Management for academic assignment | Declarative teacher directory; employee/HR profile belongs to Human Resources and account identity remains core. |
| `/teacher/classes` | Academic Management | Teacher class membership/roster contract and declarative owner pages. |
| `/register` | Academic Management | Public admissions form/config/submit contracts. |
| `/admin/study-years` | Attendance Manager | Attendance-owned Study Year extension page/read model. |

## Plugin-owned additions with no legacy page equivalent

- `/plugins/wattanam.academic-management/departments`
- `/plugins/wattanam.academic-management/subjects`
- `/plugins/wattanam.academic-management/classes`
- `/plugins/wattanam.academic-management/classes/:id`
- `/plugins/wattanam.academic-management/classes/edit/:id`
- `/plugins/wattanam.academic-management/classes/:id/students`
- `/plugins/wattanam.academic-management/classes/:id/students/:studentId`
- `/plugins/wattanam.academic-management/teachers`
- `/plugins/wattanam.academic-management/registrations`
- `/plugins/wattanam.academic-management/registrations/:id`

## Cross-owner invariants

- Core owns `User`, credentials, MFA, sessions, and generic account/contact management.
- Academic owns Student Profile, enrollment, Class, Department membership, admissions, and
  canonical teaching subjects.
- Attendance Manager owns Study Year and attendance-domain sessions/holidays.
- Human Resources owns employee profiles; a teacher's academic assignment does not transfer their
  employment record to Academic Management.
- Timetable owns schedule-local entities and consumes Academic identities through contracts.
- No dependent plugin may query an Academic private table.

## Verification sources

- Controller decorators were enumerated directly from `backend/src/{classes,departments,class-registrations,study-years}`.
- Compiled pages were enumerated from `frontend/app`.
- `npm run architecture:inventory:gate` passes with 1,434 discovered items owned and 82 models classified.
