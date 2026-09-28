# WordPress-style clean-core schema gate — 2026-09-28

## Decision

The fresh core database is protected by a fail-closed table allowlist. LCF-004 is complete: the
same physical core images and commands used by required CI passed against a disposable PostgreSQL
16 deployment on 2026-09-28.

## Implemented control

- `backend/scripts/verify-fresh-core-database.js` derives the canonical physical-table allowlist
  from every checked-in core migration, including core runtime tables that are intentionally not
  represented in the reduced Prisma model file.
- Prisma's `_prisma_migrations` ledger is the only implicit operational table.
- The verifier queries `pg_catalog.pg_tables` in `public` and fails on either an unexpected table
  or a missing canonical table. It prints the exact offending table names.
- The verifier refuses to run unless `WATTANAM_DISTRIBUTION=core`, preventing accidental use on a
  legacy or plugin-bearing school database.
- `backend/Dockerfile.core` includes the verifier in the production image.
- The required `core-deployment-smoke` PR job runs it after a fresh install. This replaces the old
  five-name blacklist, which could not prove the absence of other optional module tables.

## Local evidence

```text
node --test backend/scripts/verify-fresh-core-database.test.js tools/core-deployment-smoke-contract.test.js
tests 7; pass 7; fail 0
```

The tests prove migration allowlist derivation, operational-table inclusion, rejection of an
unexpected `Attendance` table, missing-table detection, image inclusion and required CI wiring.

## Real PostgreSQL execution

The isolated `wattanam-core-cert-20260928` deployment booted the physical API, web and gateway
images, completed first installation, rejected a repeated installation, and returned 404 for the
representative excluded Attendance, Timetable and Examination pages. The verifier then reported:

```text
Fresh core database schema verified: 29 canonical tables, 0 unexpected tables.
```

After a full recovery-set v2 restore into a second isolated PostgreSQL volume, the same verifier
again reported 29 canonical tables and zero unexpected tables. Hosted deployment certification is
still required by the separate Railway gate; it is not part of LCF-004.
