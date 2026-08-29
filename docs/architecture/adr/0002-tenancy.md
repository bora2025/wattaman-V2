# ADR-0002: Tenancy Model

Status: **Proposed** — implemented as the Version 1 default; formal acceptance is blocked on **DEC-003** at Gate **A0**.

## Context

The product could model tenancy as one shared database serving many schools (rows scoped by a `schoolId`/`tenantId` column), or as a fully separate installation per school. This choice determines the blast radius of a bug, a breach, a noisy-neighbor performance problem, and a data-residency requirement.

## Decision

**One legal school organization per installation.** A single installation (one PostgreSQL database, one API/web deployment) belongs to exactly one school. Campuses, if a school has more than one physical site, are modeled as children of that one school (via `Class`/`Department`/organizational fields), not as separate tenants sharing infrastructure.

This is already the only model the codebase supports:

- `Installation` is a **database-wide singleton** — `InstallationService` enforces exactly one row per database, created transactionally on first-run setup, and every subsequent setup attempt returns HTTP 409 (`INS-003`, verified: simultaneous setup requests produced exactly one installation and one `SUPER_ADMIN`).
- There is no `tenantId`/`schoolId` foreign key anywhere in `backend/prisma/schema.prisma` — models like `Student`, `Class`, `User` have no tenant-scoping column because there is only ever one tenant per database.
- The marketplace database (`apps/marketplace-api`) is a **separate system entirely** — it never imports school students, staff, grades, attendance, fees, messages, or location data (see [ADR-0006 licensing](./0006-licensing.md) and §11.1 of the master plan). A school's installation and the marketplace never share a database, secret, volume, or administrator identity ([technical-inventory.md](../technical-inventory.md)).

## Consequences

- **No cross-school queries are possible by construction** — there is no schema shape that could accidentally leak one school's data into another's response, because there is no shared table to query across.
- Legacy adoption (B-001–003) must map an existing school's single database into this same one-database-one-school shape; it does not need to invent tenant-scoping for existing data.
- A school that operates multiple physical campuses uses one installation with campus-level fields on existing models (`Class`, `Department`), not a second installation — multi-campus-as-multiple-tenants is explicitly out of scope for Version 1.
- Growing a chain of schools under one legal owner requires one installation per school today; a group/franchise management layer across installations is not designed and is out of scope for Version 1.

## Alternatives considered

- **Shared database, `tenantId`-scoped rows**: rejected — every query and every migration would need tenant-scoping discipline enforced by code review forever, with a single missed `WHERE tenantId = ?` capable of leaking one school's student data to another. The isolation this ADR chooses instead is enforced by the database boundary itself, not by application-code discipline.
- **Schema-per-tenant in one PostgreSQL cluster**: rejected — still shares a failure domain (one cluster outage affects every school) and doesn't match DEC-008's one-Railway-project-per-school hosting model, which already gives each school its own PostgreSQL service.

## Related

[DEC-003](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [ADR-0001 deployment](./0001-deployment-hosting.md) · [module-boundaries.md](../module-boundaries.md) · [technical-inventory.md](../technical-inventory.md)
