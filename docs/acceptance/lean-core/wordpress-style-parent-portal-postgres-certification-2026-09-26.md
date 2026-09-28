# WordPress-style Parent Portal PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Concurrency correction

Parent Portal `0.1.2` resolves each link request inside a database transaction and locks the request
row before calling account or guardian commands. A second concurrent operator waits, observes the
committed terminal state and exits without invoking an account mutation. This prevents losing
compensation from detaching the winning assignment.

The release also contributes extension-driven dashboard metadata. It does not modify the published
workflow migration.

## Certification command

`npm run certify:parent-portal:postgres` requires the exact
`PARENT_PORTAL_CERTIFY_ALLOW_DROP=parent-portal-only` guard and then:

- removes only Parent Portal certification tables;
- verifies the immutable workflow migration checksum and identity header;
- activates the real plugin against PostgreSQL;
- creates an active-student parent-link request;
- races two approvals and requires exactly one account resolution and guardian assignment;
- verifies the resulting parent sees only the roster-linked child;
- rejects another child before any read-model adapter is invoked;
- composes an installed Attendance projection;
- reports a missing Finance projection as `not-published`;
- reports an unavailable Examination provider as `adapter-unavailable`; and
- proves all five optional reads use the authorized student key and read-model version 1.

The PostgreSQL 16 PR backend job runs this certification after Finance.

## Local verification

- Certification guard and immutable migration harness: 2 passed.
- Backup-bound adoption, crash resume, reconciliation and rollback: 4 passed.
- Parent Portal source and behavior suites: 9 passed.

## Remaining acceptance gap

The first hosted PostgreSQL run, restored-backup execution, hosted password-reset onboarding,
notification delivery, role/browser/accessibility review, portable backup/restore, complete plugin
lifecycle and a controlled parent/school pilot remain required before production cutover.
