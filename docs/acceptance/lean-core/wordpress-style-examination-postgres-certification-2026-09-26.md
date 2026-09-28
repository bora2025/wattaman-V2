# WordPress-style Examination PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Release contract

Examination `0.1.5` retains Academic Management as its required provider and Timetable as an
optional provider. It adds extension-driven dashboard metadata and a transaction-scoped advisory
lock for first-attempt creation. The lock closes the absent-row race left by `FOR UPDATE` alone:
concurrent start requests now serialize and return one stable attempt.

## Certification command

`npm run certify:examination:postgres` requires the exact
`EXAMINATION_CERTIFY_ALLOW_DROP=examination-only` guard and operates only on the
`plugin_wattanam_examination_` namespace. It:

- verifies and applies all ten immutable migrations;
- activates the actual plugin with a PostgreSQL-backed database adapter;
- creates, publishes and activates an exam through Academic/core directory references;
- verifies the student delivery payload contains no answer key;
- starts the same attempt concurrently and requires both calls to return the same identity;
- submits the attempt concurrently and requires exactly one committed state transition;
- verifies automatic grading and monotonic attempt count;
- creates a gradebook with an Academic subject and roster-bound student score;
- verifies the bounded report; and
- verifies the student grade projection excludes answers, question content, manual marks and
  feedback.

The PostgreSQL 16 PR backend job runs this command after Timetable certification.

## Local verification

- Examination behavior and source suites: 15 passed.
- Backup-bound adoption, reconciliation and rollback suites: 6 passed.
- Certification guard/migration harness: 2 passed.
- Architecture and clean-core gates are rerun whenever this evidence changes.

## Remaining acceptance gap

The first hosted PostgreSQL run, restored-backup execution, legacy route cutover, rich-question
browser workflows, print/CSV/PDF parity, accessibility and a controlled school pilot remain
required before production cutover.
