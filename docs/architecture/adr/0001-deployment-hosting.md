# ADR-0001: Deployment and Hosting Topology

Status: **Proposed** — implemented as the Version 1 default; formal acceptance is blocked on **DEC-008** at Gate **B0**.

## Context

Wattanam V2 must be independently deployable per school (no shared multi-tenant hosting), verifiable end-to-end before a customer wave, and operable by a small team without a dedicated platform-engineering org. Two audiences need different operational models: schools that want managed hosting, and schools/integrators that want to self-host on existing Linux infrastructure.

## Decision

Support exactly two hosting paths for Version 1, both already implemented and smoke-tested:

1. **Railway, one project per school.** Each school gets an isolated Railway project containing a private PostgreSQL service, a private API service, a private web service, and a public Caddy gateway — the gateway is the *only* public service. The API holds a persistent `/data` volume. CORS is pinned to the exact school origin. This is proven end-to-end: the `Angkor School` reference project has isolated services, exact-origin CORS, a persistent volume, and a completed browser owner-setup flow ([foundation-runtime-2026-08-27.md](../../acceptance/foundation-runtime-2026-08-27.md), deployment evidence 2026-08-28).
2. **Docker Compose on Linux**, for self-hosting. The same container images run under Compose v2 with the same service topology (PostgreSQL/API/web/gateway), verified by a clean Compose acceptance run.

Not supported for Version 1: Kubernetes, shared multi-tenant hosting, multi-region active-active operation, or any topology that makes core school operation depend on continuous cloud availability (school API and PostgreSQL run locally to the school's Railway project or the operator's Compose host — never in a shared control-plane database).

## Consequences

- Every school's blast radius is contained to its own project/host — a compromised or failing school cannot affect another school's data or availability.
- Provisioning one project per school is currently **manual** (B-006 — automated one-project-per-school provisioning — is not yet built); this ADR records the target topology, not the automation.
- Custom-domain state management (B-007), scheduled backups/restore drills (B-008), and background-worker process boundaries (B-013) are still open work packages against this same topology, not competing topologies.
- Self-hosted Compose deployments carry a support-matrix obligation (see [support-matrix.md](../support-matrix.md)): the operator, not Wattanam, owns the underlying Docker Engine/OS patching.

## Alternatives considered

- **Shared multi-tenant single deployment**: rejected — a single shared database or service fleet would make one school's incident (data breach, resource exhaustion, noisy-neighbor load) a risk to every other school, and directly contradicts DEC-003's one-school-per-installation tenancy model.
- **Kubernetes**: rejected for Version 1 — the team size and the "small school, low-ops" target customer don't justify the operational complexity; Compose and Railway's own orchestration cover the required isolation without it.

## Related

[DEC-008](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [ADR-0002 tenancy](./0002-tenancy.md) · [technical-inventory.md](../technical-inventory.md) · B-005/B-006/B-007/B-008/B-013 (automation still open)
