# WordPress-style Academic Management PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Certification command

`npm run certify:academic-management:postgres` now runs against a real PostgreSQL database and:

- requires the exact `ACADEMIC_CERTIFY_ALLOW_DROP=academic-management-only` safety guard;
- discovers and drops only the `plugin_wattanam_academic_management_` namespace;
- applies all ten ordered package migrations;
- accepts the six historically published headerless migrations only when their bytes and manifest
  checksums match the hard-coded immutable compatibility pins;
- activates the actual plugin backend against a Prisma/PostgreSQL database adapter;
- exercises department create/update/unique-constraint/delete behavior;
- exercises subject create/update and the published subject lookup contract;
- verifies durable lifecycle publications; and
- removes the isolated plugin namespace after a successful run.

The pull-request backend job provisions PostgreSQL 16, applies the core migrations and then runs
this certification before build/audit. A migration or runtime SQL change that works only with mocks
will therefore fail CI.

## Local verification

- Certification guard and immutable-migration tests pass.
- The Academic Management reference suite passes after reconciling its expected published subject
  lookup route.
- Architecture ownership and clean-core tests remain green.

## Remaining acceptance gap

This file does not claim the Academic plugin production-ready. The first green hosted CI run,
restored-backup adoption/reconciliation/rollback, marketplace lifecycle on a clean lean-core school,
browser role parity and controlled pilot evidence remain required.

