# MP-2 Academic Contracts Evidence

Date: 2026-09-15
Status: in progress (boundary delegation slice validated)
Wave: MP-2 academic foundation
Checklist: [MP-2 Academic Foundation Checklist](../architecture/mp2-academic-foundation-checklist.md)

## Goal

Create and verify the first versioned roster/enrollment contract scaffold and dependent-plugin fixture consumption path for MP2-004 and MP2-008.

## Scope in this pass

- Define a versioned Academic Management roster contract descriptor.
- Define lifecycle event contract descriptors with outbox/idempotency semantics.
- Add fixture provider methods for:
  - class roster lookup
  - enrollment-at-date lookup
  - academic audience resolution
- Validate dependent fixture consumption (attendance/timetable/finance examples) through contract provider methods only.
- Add a runtime boundary hook in `DirectoryService` so CLASS audience expansion can route through an academic contract provider.
- Wire a concrete Prisma-backed academic provider and delegate both CLASS audience and classes-for-user lookups.
- Extend delegation so `lookupClasses` can route through the same academic provider boundary.
- Add dependent runtime proof that plugin execution resolves class lookups and membership through the provider-backed directory path.
- Integrate a first real dependent service path (`ScoringService.getSheetsForClassAdmin`) to use directory contract membership resolution instead of direct class table lookup.
- Integrate a second dependent service path (attendance record and bulk record entry points) to enforce CLASS_ADMIN class access through `DirectoryService.classesForUser`.
- Integrate a third dependent service path (`ExamService.getStudentExams`) to scope class-bound exams via `DirectoryService.classesForUser` instead of direct student-class joins.
- Integrate a fourth dependent service path (`CoursesService.getStudentCourses`) to scope class-bound course visibility via `DirectoryService.classesForUser`.
- Start MP2-001 auth read/write split by introducing an academic identity provider seam for parent-link writes and academic-domain delete bindings.
- Extend MP2-001 auth split by routing non-core user read-model enrichment through the academic identity provider seam.
- Remove the user-delete transaction leak: core auth sends a deterministic detach command and the
  academic adapter owns its own transaction without a direct Prisma fallback in `AuthService`.
- Remove academic relation-query fallbacks from auth list/detail/search; core identity projections
  are now mandatory and provider enrichment fails closed when unavailable.
- Move department assignment and clearing out of account create/update data and response selects;
  a validated, deterministic provider command owns the academic mutation.
- Force password login, refresh validation and refresh rotation to use the same core-only user
  projection in legacy and core distributions.
- Replace auth-owned parent-link Prisma fallback with a deterministic Academic Management command
  for assignment and clearing.
- Publish department membership through the academic directory provider and migrate Session
  Configuration away from direct `User.departmentId` reads.
- Move Departments CRUD behind a provider contract; keep Prisma and atomic user unassignment inside
  the legacy academic adapter.

## Files added

- backend/scripts/mp2-academic-contracts-scaffold.js
- backend/scripts/mp2-academic-contracts-scaffold.test.js
- docs/architecture/mp2-identity-split-worksheet.md

Files updated:

- backend/src/directory/directory.service.ts
- backend/src/directory/directory.service.spec.ts
- backend/src/directory/directory.module.ts
- backend/src/scoring/scoring.service.ts
- backend/src/scoring/scoring.module.ts
- backend/src/attendance/attendance.service.ts
- backend/src/attendance/attendance.controller.ts
- backend/src/attendance/attendance.module.ts
- backend/src/exam/exam.service.ts
- backend/src/exam/exam.module.ts
- backend/src/courses/courses.service.ts
- backend/src/courses/courses.module.ts
- backend/src/auth/auth.service.ts
- backend/src/auth/auth.module.ts

Files added:

- backend/src/directory/academic-directory.provider.ts
- backend/src/scoring/scoring.service.spec.ts
- backend/src/attendance/attendance.service.spec.ts
- backend/src/exam/exam.service.spec.ts
- backend/src/courses/courses.service.spec.ts
- backend/src/auth/academic-identity.contract.ts
- backend/src/auth/academic-identity.provider.ts
- backend/src/auth/auth-academic-identity-provider.spec.ts
- backend/src/auth/auth-academic-read-provider.spec.ts
- backend/src/auth/academic-identity.provider.spec.ts
- backend/src/session-config/session-config-academic-boundary.spec.ts
- backend/src/departments/academic-departments.contract.ts
- backend/src/departments/academic-departments.provider.ts
- backend/src/departments/academic-departments.provider.spec.ts
- backend/src/departments/departments.service.spec.ts

## Command executed

From backend workspace:

- node scripts/mp2-academic-contracts-scaffold.test.js

## Result

- tests: 3
- pass: 3
- fail: 0
- cancelled: 0
- skipped: 0

Directory runtime boundary tests:

- suite: 1 passed
- tests: 14 passed
- fail: 0
- command: `node node_modules/jest/bin/jest.js --runInBand src/directory/directory.service.spec.ts --watchAll=false --verbose --forceExit`
- note: Jest reported a force-exit warning about possible open handles; all assertions completed and passed.

Dependent runtime proof (focused execution):

- suite: 1 passed
- tests: 1 passed, 9 skipped
- fail: 0
- command: `node node_modules/jest/bin/jest.js --runInBand src/plugins/plugin-runtime.service.spec.ts --watchAll=false --verbose --forceExit --testNamePattern="dependent plugin path resolves class lookups through provider-backed DirectoryService" --detectOpenHandles --testTimeout=20000`
- note: full-file execution of `plugin-runtime.service.spec.ts` remained in `RUNS` in this environment, so evidence was captured through the targeted test pattern.

Dependent service integration proof (Scoring):

- suite: 1 passed
- tests: 2 passed
- fail: 0
- command: `node node_modules/jest/bin/jest.js --runInBand src/scoring/scoring.service.spec.ts --watchAll=false --verbose --forceExit`
- note: assertions verify CLASS_ADMIN scoping calls `DirectoryService.classesForUser` and does not call `prisma.class.findMany` on this path.

Dependent service integration proof (Attendance):

- suite runs: 3 focused runs, all passed
- tests: 3 passed, 0 failed, 6 skipped
- commands:
  - `node node_modules/jest/bin/jest.js --runInBand src/attendance/attendance.service.spec.ts --watchAll=false --verbose --forceExit --testNamePattern="rejects recordAttendance" --detectOpenHandles --testTimeout=20000`
  - `node node_modules/jest/bin/jest.js --runInBand src/attendance/attendance.service.spec.ts --watchAll=false --verbose --forceExit --testNamePattern="allows recordAttendance" --detectOpenHandles --testTimeout=20000`
  - `node node_modules/jest/bin/jest.js --runInBand src/attendance/attendance.service.spec.ts --watchAll=false --verbose --forceExit --testNamePattern="rejects bulk attendance" --detectOpenHandles --testTimeout=20000`
- note: full-file run for this new attendance spec remained in `RUNS`; evidence is captured through focused test patterns in this environment.

Dependent service integration proof (Exam):

- suite: 1 passed
- tests: 2 passed
- fail: 0
- command: `node node_modules/jest/bin/jest.js --runInBand src/exam/exam.service.spec.ts --watchAll=false --verbose --forceExit`
- note: assertions verify `getStudentExams` uses directory-resolved student class memberships and falls back to global exams (`classId: null`) when no memberships are returned.

Dependent service integration proof (Learning/Courses):

- suite: 1 passed
- tests: 3 passed
- fail: 0
- command: `node node_modules/jest/bin/jest.js --runInBand src/courses/courses.service.spec.ts --watchAll=false --verbose --forceExit`
- note: assertions verify `getStudentCourses` resolves class scope through directory memberships, keeps enrollment-based visibility, and returns empty when no student profile exists.

MP2-001 auth seam proof (identity split start):

- suites: 2 passed
- tests: 7 passed
- fail: 0
- commands:
  - `node node_modules/jest/bin/jest.js --runInBand src/auth/auth-academic-identity-provider.spec.ts --watchAll=false --verbose --forceExit`
  - `node node_modules/jest/bin/jest.js --runInBand src/auth/auth-core-distribution.spec.ts --watchAll=false --verbose --forceExit`
- note: verifies `setStudentParent` and academic delete bindings delegate through the provider boundary when configured, while existing core-distribution behavior remains passing.

MP2-001 auth read-model delegation proof:

- suites: 3 passed
- tests: 11 passed
- fail: 0
- commands:
  - `node node_modules/jest/bin/jest.js --runInBand src/auth/auth-academic-read-provider.spec.ts --watchAll=false --verbose --forceExit`
  - `node node_modules/jest/bin/jest.js --runInBand src/auth/auth-academic-identity-provider.spec.ts --watchAll=false --verbose --forceExit`
  - `node node_modules/jest/bin/jest.js --runInBand src/auth/auth-core-distribution.spec.ts --watchAll=false --verbose --forceExit`
- note: verifies non-core `getUsers`, `getUserById`, and `searchUsers` can resolve academic enrichment through `ACADEMIC_IDENTITY_PROVIDER` while legacy relation-select fallback remains intact when no provider is configured.

MP2-001 delete command boundary proof:

- suites: 4 passed
- tests: 15 passed
- fail: 0
- build: passed (277 files compiled)
- note: verifies that auth supplies `delete-user:<userId>` as the deterministic idempotency key,
  performs no direct academic fallback, fails closed without the provider, and that the Prisma
  academic adapter owns a repeat-safe transaction.

MP2-001 core-only identity projection proof:

- suites: 11 passed
- tests: 47 passed
- fail: 0
- command: `npm.cmd test -- --runInBand src/auth`
- note: identity list/detail/search always use core-only projections; the missing-provider test
  confirms auth does not silently return to academic Prisma relation selects.

MP2-001 department command proof:

- suites: 11 passed
- tests: 51 passed
- fail: 0
- command: `npm.cmd test -- --runInBand src/auth`
- note: registration/update contain no direct department mutation, assignment and clearing use
  `assign-department:<userId>:<departmentId|none>`, invalid departments fail before mutation, and
  update responses are enriched through the provider.

MP2-001 authentication session projection proof:

- suites: 12 passed
- tests: 53 passed
- fail: 0
- command: `npm.cmd test -- --runInBand src/auth`
- note: password login, refresh validation and refresh rotation explicitly select only core auth
  fields; regression assertions reject department, student and parent relation projections.

MP2-001 parent assignment command proof:

- suites: 12 passed
- tests: 56 passed
- fail: 0
- command: `npm.cmd test -- --runInBand src/auth`
- note: parent assignment and clearing use `assign-parent:<studentUserId>:<parentId|none>`;
  malformed keys, missing student profiles and non-parent accounts fail before mutation, and auth
  contains no direct Student/User validation fallback.

MP2-001/MP2-004 department membership consumer proof:

- suites: 2 passed
- tests: 16 passed
- fail: 0
- build: passed (280 files compiled)
- command: `npm.cmd test -- --runInBand src/directory/directory.service.spec.ts src/session-config/session-config-academic-boundary.spec.ts`
- note: `SessionConfigService.getUserOrganizationId` delegates to `DirectoryService.departmentForUser`;
  missing provider support fails closed and no direct User query occurs in the dependent service.

MP2-002 Departments provider boundary proof:

- suites: 2 passed
- tests: 3 passed
- fail: 0
- build: passed (284 files compiled)
- command: `npm.cmd test -- --runInBand src/departments/departments.service.spec.ts src/departments/academic-departments.provider.spec.ts`
- note: the public service delegates every operation; deletion validates
  `delete-department:<id>` and atomically unassigns legacy users before deleting the department.

Boundary assertions covered:

- CLASS audience uses academic provider when configured.
- CLASS audience falls back to existing local joins when provider is absent.
- classesForUser uses academic provider when configured.
- classesForUser falls back to existing local joins when provider method is absent.
- lookupClasses uses academic provider when configured.
- lookupClasses falls back to Prisma class lookup when provider method is absent.
- Dependent plugin runtime context uses provider-backed directory lookups without direct Prisma class/student reads in the tested path.
- Scoring class-admin sheet scoping resolves class membership through the directory contract path rather than direct class lookup.
- Attendance record and bulk-record entry points enforce CLASS_ADMIN class membership through directory contract resolution before attendance writes.
- Exam student exam discovery resolves class scope through directory contract memberships instead of direct `student.classId` usage.
- Course student listing resolves published class scope through directory contract memberships instead of direct `student.classId` usage.
- Auth parent-link writes and academic-domain deletion have an explicit provider seam
  (`ACADEMIC_IDENTITY_PROVIDER`); the delete path has no direct academic fallback.
- Auth non-core read-model enrichment now has the same provider seam, reducing direct auth coupling to academic relation joins.
- Auth identity list/detail/search have no direct academic relation fallback and fail closed when
  the enrichment provider is missing.
- Account registration/update delegate department assignment and never select the academic
  department relation directly.
- Authentication and refresh session loading use a core-only projection in every distribution.
- Parent assignment and clearing are owned by the academic provider contract with no auth fallback.
- Session Configuration consumes academic department membership through the directory contract.
- Departments CRUD is isolated behind an Academic Management provider boundary.
- Existing SCHOOL/ROLE resolution and class lookup behavior remain passing.

Passing tests:

- declares MP-2 roster contract and lifecycle events with versioned IDs
- fixture returns stable class roster and enrollment snapshots
- dependent fixtures consume contract provider without direct table access

## Assessment

- MP2-004 has a validated initial scaffold for roster/enrollment contract shape and versioning.
- MP2-008 has an initial fixture proof that dependent flows can consume the provider abstraction.
- This pass adds first runtime wiring at the core boundary (`DirectoryService`) for CLASS audience delegation.
- MP2-001 has started with a contract seam in auth for academic-owned write/delete couplings.
- MP2-001 now includes both write/delete delegation and read-model enrichment delegation through the academic identity provider seam.
- Dependent services are not fully rewired yet; Timetable/Finance and deeper learning/admissions/class-registration flows remain follow-up execution items.

## Next action

Wire this scaffold to runtime adapters in core/plugin boundary code, then add integration contract tests against real service entry points.
