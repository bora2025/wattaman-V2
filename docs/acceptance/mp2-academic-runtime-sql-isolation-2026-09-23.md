# MP-2 Academic Management runtime SQL isolation

Date: 2026-09-23  
Scope: local runtime-contract verification

## Result

Academic Management no longer issues plugin-database SQL against core `User`, legacy `Department`,
legacy `Student`, legacy `Class`, `StudyYear`, or `ClassRegistration` tables. The plugin database
capability is namespace-scoped in production, so those queries would have failed even though the
earlier permissive reference harness accepted them.

Core account identity is now resolved through the capability-gated `directory.read` adapter:

- Teacher and class-admin roles are validated with `lookupUsers`.
- Class responses resolve teacher and class-admin display identity at read time.
- Student roster responses resolve stable account identity at read time.
- Teacher lists combine the core directory with plugin-owned Department memberships.
- Parent role validation uses the directory rather than core-table SQL.
- Student profile editing changes only plugin-owned academic fields. Core name, email, and phone
  must be changed through User Management and are no longer written by the plugin.

`lookupUsers` now returns optional email and phone fields in addition to id/name/role. This is a
backward-compatible SDK extension and remains protected by `directory.read`.

## Verification

- Academic reference contract: 6/6 passed, including a static cross-schema SQL regression check.
- Directory service contract: 16/16 passed.
- Plugin runtime, SDK, and UI schema focused suites: 39/39 passed after the contract extension.
- Academic package validation and activation harness: all checks passed.
- Backend production build passed.

## Remaining gate

Real PostgreSQL and hosted lifecycle verification remain required. This evidence closes the local
runtime-isolation defect only; it does not close MP-2 certification or authorize legacy-table
removal.

## 2026-09-25 Department runtime binding addendum

Academic Management now owns `GET contracts/users/:id/department`. A user may read their own
membership; another user's membership requires an administrator principal. When
`ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER=plugin`, `DirectoryService.departmentForUser()` uses the
same lifecycle-bound dispatcher as the roster contracts, validates the response, and fails closed
when Academic is not active. `PrismaAcademicDirectoryProvider` no longer contains SQL for
`plugin_wattanam_academic_management_user_department`.

Verification:

- Academic reference contract: **11/11 passed**.
- Directory/provider/runtime/session boundary suites: **36/36 passed**, including invalid-owner
  configuration rejection for both roster and Department contracts.
- Backend production build: **302 files compiled**.

At this checkpoint Department writes were still a migration seam; the identity-command addendum
below supersedes that write-side limitation. MP2-001 remains partial for profile enrichment and
the remaining mixed identity concerns.

## 2026-09-25 identity command addendum

Three mutation seams now support explicit owner cutover:

- `ACADEMIC_DEPARTMENT_WRITE_OWNER=plugin` dispatches Department assignment/clearing;
- `ACADEMIC_STUDENT_PROFILE_WRITE_OWNER=plugin` dispatches guardian assignment/clearing; and
- `ACADEMIC_IDENTITY_DETACH_OWNER=plugin` dispatches user Academic-identity detach.

Each route requires an administrator principal and an exact deterministic idempotency key. The
core adapter binds commands only while Academic Management is active, fails closed after unload,
and rejects simultaneous legacy shadow writes with plugin ownership. Plugin detach mutates only
Academic-owned Class roles, Department membership, guardianship, enrollment intervals, and Student
Profile. Attendance and Finance cleanup must be handled by those owners' lifecycle consumers.

Verification:

- Academic owner contract: **11/11 passed**.
- Academic identity adapter and plugin runtime lifecycle: **35/35 passed**.
- Backend production build: **302 files compiled**.

## 2026-09-25 profile-enrichment addendum

With both `ACADEMIC_DEPARTMENT_MEMBERSHIP_READ_OWNER=plugin` and
`ACADEMIC_STUDENT_PROFILES_READ_OWNER=plugin`, auth enrichment now calls the active plugin's bounded
`contracts/users/academic-profiles` route. The owner reads only its Department membership, Student
Profile, enrollment, and Class tables; guardian and child display identities use `directory.read`.
The core adapter requires schema version 1 and exactly one unique response for every requested user,
and fails closed when Academic is inactive or coverage is incomplete.

Verification:

- Academic owner contract: **11/11 passed**.
- Academic identity and runtime lifecycle suites: **36/36 passed**.
- Backend production build: **302 files compiled**.

Mixed legacy/plugin rollback modes retain their migration-era parity paths. Hosted cutover and the
remaining mixed User-model decisions are still open, so MP2-001 and MP-2 certification remain open.
