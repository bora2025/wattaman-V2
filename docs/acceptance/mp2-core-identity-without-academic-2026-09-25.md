# MP2 core identity without Academic Management — 2026-09-25

Status: local boundary accepted; hosted distribution certification remains part of MP2-009.

## Assertion

A `core` distribution must administer platform accounts and authenticate administrators when
Academic Management is absent. Core identity operations must not query or mutate Student, Class,
Department, Attendance, or Finance storage.

## Verified path

`AuthService` was constructed without `ACADEMIC_IDENTITY_PROVIDER` and with a Prisma surface that
contains only core-owned User, token, notification, preference, and password-reset stores. The
test exercises password validation, ADMIN registration and session issuance, account
list/search/detail/update, and account deletion.

The test also asserts that create/update/read projections contain no Department, Student Profile,
or parent-student relation and that no Student, Class, Department, Attendance, or Fee client is
available to succeed accidentally.

## Verification

```text
npm test -- --runInBand src/auth/auth-core-distribution.spec.ts src/auth/auth-core-session-projection.spec.ts
Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
```

## Scope limit

This proves the local core identity boundary and closes the corresponding MP-2 exit criterion. It
does not certify hosted plugin cutover, mixed legacy/plugin migration modes, or production rollout.
