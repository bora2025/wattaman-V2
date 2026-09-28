# WordPress-style Learning PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Destructive migration approval

Learning `0.1.3` retains the immutable `014_allow_assignment_attempts` migration, which replaces
the original one-submission identity with an attempt-number identity. The certification refuses to
run unless both `LEARNING_CERTIFY_ALLOW_DROP=learning-only` and the exact
`LEARNING_CERTIFY_DESTRUCTIVE_APPROVAL=014_allow_assignment_attempts` value are present. This makes
the destructive transition visible and specific instead of treating a general test guard as
approval.

The release also publishes an extension-driven dashboard contribution. It does not alter any
published migration bytes.

## Certification command

`npm run certify:learning:postgres`:

- verifies and applies all fourteen immutable migrations;
- proves the approved multi-attempt unique identity exists;
- activates the actual plugin with a PostgreSQL-backed database adapter;
- creates a course, lesson and rich question through Academic/core directory contracts;
- executes course publication, enrollment and activation lifecycle transitions;
- verifies the student lesson payload does not expose answer keys;
- starts the same lesson concurrently and requires one stable in-progress attempt;
- records and automatically grades the student response;
- finishes the attempt concurrently and requires exactly one committed transition; and
- creates a course session and verifies roster-bound attendance upsert semantics.

The PostgreSQL 16 PR backend job runs this command after Examination certification with the exact
destructive approval value.

## Local verification

- Learning workflow and source suites: 28 passed.
- Backup-bound adoption, reconciliation and rollback suites: 6 passed.
- Certification approval/migration harness: 2 passed.
- Architecture and clean-core gates are rerun whenever this evidence changes.

## Remaining acceptance gap

The first hosted PostgreSQL run, restored-backup execution, legacy route cutover, full teacher and
student browser parity, rich lesson/quiz accessibility, notification delivery and a controlled
school pilot remain required before production cutover.
