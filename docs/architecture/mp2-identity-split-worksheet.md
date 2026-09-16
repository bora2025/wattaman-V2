# MP2-001 Identity Split Worksheet

Status: draft for implementation
Date: 2026-09-15
Wave: MP-2 academic foundation

## Goal

Separate lean-core account identity/authentication concerns from academic domain profile and enrollment concerns before Academic Management extraction.

## Current coupling snapshot

### Core auth currently coupled to academic/department data

Primary file: `backend/src/auth/auth.service.ts`

Observed couplings:

- Legacy-distribution user selection includes `departmentId` and `department` joins.
- `getUsers()` in legacy mode includes `studentProfile`, `class`, and `parentStudents` projections.
- `setStudentParent()` writes directly to `student.parentId`.
- `deleteUser()` deletes and mutates student-attached domain rows (`student`, `attendance`, `feeRecord`) in the auth service transaction.

### Directory currently coupled to class/student tables

Primary file: `backend/src/directory/directory.service.ts`

Observed couplings:

- `resolveAudience({ audience: 'CLASS' })` includes direct `class`, `students`, `user`, `parent` table reads.
- `classesForUser()` reads class assignments and student/parent class membership directly.
- Plugin `directory.read` capability currently resolves through these direct class/student joins.

### Academic module ownership anchor

Ownership source: `docs/architecture/ownership-manifest.json`

- `Class`, `Student`, `ClassRegistration`, `ClassRegistrationSettings`, `ClassRegistrationField`, `StudyYear`, `Department` owned by `wattanam.academic-management`.

## Target boundary after MP-2

### Lean core keeps

- Account identity and credentials (`User`, auth tokens, MFA, password reset).
- Role/permission evaluation and plugin capability gate enforcement.
- Generic notification preference and delivery transport.

### Academic Management owns

- Student academic profile, class membership, admissions/intake fields, enrollment lifecycle.
- Class/study-year/department canonical academic entities.
- Roster and enrollment contract APIs used by dependents.

### Contract bridge required

Lean-core `DirectoryService` and auth-facing profile composition must consume Academic Management contracts instead of direct class/student SQL:

- `getClassRoster(classId, asOfIsoDate)`
- `getEnrollmentAtDate(studentId, asOfIsoDate)`
- `resolveAcademicAudience(audience, targetRole, classId)`

## MP2-001 implementation slices

1. Auth read/write split
- Introduce core-only `AuthIdentityService` query projection for user identity fields.
- Move student-profile enrichment and parent-link writes behind Academic Management contracts.

2. Directory bridge split
- Keep SCHOOL/ROLE audience in lean core.
- Move CLASS and class-membership resolution to Academic Management contract adapter.

3. Delete-flow split
- Remove domain deletions from auth transaction.
- Emit contract command or event for academic-domain detach/archive operations.

4. Verification
- Add tests that fail if auth or directory services read/write academic tables directly in core mode.
- Add dependent fixtures proving attendance/timetable/finance consume contract provider APIs.

## Risks

- Hard break if dependent services still assume direct class/student joins.
- Data integrity drift during transition if delete flows are split without idempotent domain commands.
- Legacy UI payload shape changes if read-model composition is altered without compatibility coverage.

## Evidence target

- `docs/acceptance/mp2-academic-contracts-2026-09-15.md`
