# WordPress-style Human Resources PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Correctness change

Payroll approval and payment now acquire a PostgreSQL row lock and perform their state transition
inside one transaction. The update count must be exactly one. This removes the earlier read/update
race in which concurrent approvers or payers could both receive a success response.

## Certification command

`npm run certify:human-resources:postgres` requires
`HR_CERTIFY_ALLOW_DROP=human-resources-only` and operates only on the
`plugin_wattanam_human_resources_` namespace. It:

- verifies checksums and identity headers for all six immutable migrations;
- activates the real plugin against PostgreSQL;
- writes and reads normalized CV data;
- creates minor-unit payroll and runs two concurrent approval requests, requiring exactly one to
  succeed;
- completes the segregated payment transition and verifies the stored minor-unit amount;
- proves staff attendance upsert behavior; and
- verifies the published attendance projection omits marker identity.

The PostgreSQL 16 PR backend job runs this command after Academic Management certification.

## Local verification

- Certification guard/migration tests: 2 passed.
- HR behavior and source suites: 7 passed.
- Local PostgreSQL 16.14 execution passed on 2026-09-28; the first hosted CI execution remains to be recorded.

## Remaining acceptance gap

Restored-backup adoption and rollback, browser role parity, privacy/specialist approval, marketplace
lifecycle certification and pilot evidence remain required before Stable cutover.

