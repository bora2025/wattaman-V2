# ADR-0003: Database Engine and Migration Tooling

Status: **Accepted** — this is an implementation choice, not one of the 13 tracked business decisions (DEC-001–013); it does not have a Gate-blocking freeze date. Recorded here because A-003 names "database" as a required ADR subject.

## Context

Wattanam V2 needs relational integrity for academic/financial/attendance records, transactional migration safety for both core and third-party plugin schema changes, and a toolchain the small team can operate without a dedicated DBA function.

## Decision

**PostgreSQL, accessed through Prisma, with checked-in migration files as the only path to schema change in production.**

- **PostgreSQL 16.x** (Docker Compose self-hosted) and **18.x** (Railway managed) are both supported school-database engines; the API image ships a PostgreSQL 18.x client capable of dumping either version ([support-matrix.md](../support-matrix.md)).
- **Prisma 5.22.x** is the ORM/migration tool for both the school schema (`backend/prisma/schema.prisma`) and the separate marketplace schema (`apps/marketplace-api/prisma/schema.prisma`) — two independent schemas, never a shared one, per [ADR-0002](./0002-tenancy.md).
- Production **never** uses `prisma db push`; only `prisma migrate deploy` against checked-in migration files is used (`DB-003`, verified: the release container applied four checked-in migrations this way). The destructive online JSON restore path was removed outright (`OPS-004`) in favor of native `pg_dump`/`pg_restore`.
- Plugin-owned schema changes reuse the same migration primitive under a namespace guard, inside a transaction, behind a PostgreSQL advisory lock (`pg_advisory_xact_lock`) so concurrent lifecycle operations against the same plugin serialize rather than race (`PLG-008`, C-001/C-002 — live-verified: a deliberately failing migration rolls back SQL and migration history together on real PostgreSQL 16).
- Legacy schools are **adopted into** this migration history rather than re-created — `legacy-adopt.js` fingerprints an existing database, backs it up, and records it as already-migrated, so an existing school's database is never dropped and recreated (B-001/B-002).

## Consequences

- Every schema change — core or plugin — goes through the same reviewed, transactional, checked-in-file mechanism; there is no code path that mutates production schema without a migration artifact to audit.
- Supporting two PostgreSQL major versions (16 and 18) means every migration and every backup/restore drill must be re-verified on both before a release is considered supported — this is already built into the release matrix (C-005's lifecycle certification ran identically on both).
- A live gotcha specific to this stack was found and documented for plugin authors: a cached query plan (`SELECT *`) can hit a stale-plan error (SQLSTATE `0A000`) across a live schema-changing update on a pooled connection; the guidance is to select explicit columns across a migration boundary ([package-and-runtime.md](../plugins/package-and-runtime.md)).
- Prisma's generated client ties the API's build to the exact schema at build time; a schema/migration drift between two developers' uncommitted work (a real incident found and resolved during this program, see [gate-c-plugin-developer-tooling-2026-08-28.md](../../acceptance/gate-c-plugin-developer-tooling-2026-08-28.md)) surfaces as a runtime `P2022`, not a build failure — this is a known sharp edge of the tool, not a defect in this ADR's decision.

## Alternatives considered

- **A hand-rolled SQL migration runner**: rejected — Prisma's generated, type-checked client plus its migration diffing catches an entire class of manual-SQL mistakes (typoed column names, drifted types) at compile time that a raw SQL runner would not.
- **MySQL**: rejected — PostgreSQL's advisory-lock primitive is load-bearing for the plugin migration-lock design (`PLG-008`); switching engines would require re-deriving that mechanism.
- **A managed multi-tenant database (e.g. one shared Postgres cluster with schema-per-school)** was considered and rejected under [ADR-0002](./0002-tenancy.md), not here — this ADR only covers engine/tooling choice, not tenancy shape.

## Related

[ADR-0002 tenancy](./0002-tenancy.md) · [support-matrix.md](../support-matrix.md) · [technical-inventory.md](../technical-inventory.md) · A-009 (controlled toolchain upgrade, in progress)
