
# Wattanam V2

> **Repository transition:** the deployable self-hosted school now lives in
> [`bora2025/Customer-School`](https://github.com/bora2025/Customer-School). This repository is being
> reduced to the Marketplace control plane, Platform Admin, shared Marketplace contracts, publisher
> tooling, and official free/paid plugin development. The existing school backend/frontend remain
> temporarily only while cross-repository contracts, Marketplace web pages, plugin conformance tests,
> and legacy module references are extracted. Do not delete them before their cleanup gates pass.

See the [Marketplace and Plugin Workspace Cleanup Plan](./docs/architecture/marketplace-plugin-workspace-cleanup-plan.md)
for the ordered split and deletion gates.

Wattanam V2 currently contains the Marketplace and plugin ecosystem plus temporary customer-school
extraction dependencies.

Planning and delivery documentation:

- [Platform master execution plan](./docs/platform-master-execution-plan.md) — authoritative phases, decisions, owners, estimates, dependencies, and release gates.
- [A-to-Z architecture](./docs/platform-architecture-plan-a-to-z.md) — target platform architecture and invariants.
- [Implementation baseline](./docs/implementation-baseline.md) — evidence-based current implementation status.
- [Technical ownership inventory](./docs/architecture/technical-inventory.md) — systems, data, configuration, files, providers, and contract boundaries.
- [Version 1 support matrix](./docs/architecture/support-matrix.md) — tested runtime and deployment baselines.
- [Architecture decision index](./docs/architecture/adr/README.md) — approval format and implementation mapping for DEC-001–013.
- [Manual Railway dashboard setup](./docs/operations/railway-manual-setup-guide.md) — click-by-click marketplace and one-project-per-school deployment, setup, verification, persistence, and handoff.
- [Railway deployment per school](./docs/deployment/railway-per-school.md) — architecture invariants and custom-domain runbook.
- [Plugin package and runtime](./docs/plugins/package-and-runtime.md) — plugin trust and SDK contract.
- [Official repository](./docs/marketplace/official-repository.md) — signed distribution operations.
