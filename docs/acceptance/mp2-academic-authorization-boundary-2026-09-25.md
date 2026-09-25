# MP-2 Academic authorization boundary

Date: 2026-09-25  
Status: local contract passed; hosted certification remains open

## Requirement

Academic Management route permissions are assignable by the host. A broad or mistaken permission
grant must not allow a non-administrator to mutate Class structure or inspect and manage private
Admissions configuration and registrations. Public form discovery and submission remain separate
flows and are not covered by this administrator boundary.

## Implementation

`plugins/wattanam.academic-management/backend/index.js` now requires an authenticated principal
with role `SUPER_ADMIN`, `SCHOOL_ADMIN`, or `ADMIN` before:

- creating, updating, or deleting a Class;
- reading or changing Admissions settings and custom fields;
- listing or reading private registrations; and
- approving or rejecting a registration.

The check occurs before input-dependent database reads, transactions, or writes. Existing
class-scoped rules remain in place for assigned teachers and class administrators on permitted
class, roster, and Document Designer source reads and roster operations.

## Verification

From the repository root:

```text
node --test backend/scripts/academic-management-reference-plugin.test.js
```

Result: **10 passed, 0 failed**. The added regression case invokes thirteen protected routes as a
Teacher and verifies every request fails with `Administrator access is required` while the database
call count stays exactly zero. Existing route registration, read-only, row-scope, lifecycle,
Admissions, roster, manifest, UI, and migration contracts remain green.

```text
npm.cmd --prefix backend run build
```

Result: **passed**, 302 files compiled with SWC.

This evidence closes only the local administrator-boundary defect. It does not claim hosted page,
PostgreSQL adoption, recovery, cutover, or pilot certification, so MP-2 remains open.
