# Architecture Decision Record Index

The master plan DEC-001–013 is the decision register. This index maps each decision to implementation ownership and the gate that prevents an unapproved assumption from shipping.

## Records (A-003)

Eight ADRs, one per subject A-003 names, each recording the Version 1 default already implemented, its consequences, and the alternatives rejected. All but [database](./0003-database.md) are `Proposed` — implemented, but formally blocked on their corresponding DEC's acceptance; [telemetry](./0008-telemetry.md) is `Proposed, not yet implemented` since no telemetry code exists at all today. A-003's own acceptance evidence ("ADR index and immutable accepted records") cannot be fully satisfied until A-001 accepts the underlying decisions — these records exist so the technical reasoning is captured now rather than reconstructed later.

| ADR | Subject | Decision(s) | Status |
|---|---|---|---|
| [0001](./0001-deployment-hosting.md) | Deployment/hosting | DEC-008 | Proposed |
| [0002](./0002-tenancy.md) | Tenancy | DEC-003 | Proposed |
| [0003](./0003-database.md) | Database | — (implementation choice) | Accepted |
| [0004](./0004-plugin-trust.md) | Plugin trust | DEC-011 | Proposed |
| [0005](./0005-storage.md) | Storage | DEC-010 | Proposed |
| [0006](./0006-licensing.md) | Licensing | DEC-001, DEC-013 | Proposed |
| [0007](./0007-payment-adapter.md) | Payment adapter | DEC-009 | Proposed |
| [0008](./0008-telemetry.md) | Telemetry | DEC-012 | Proposed, not implemented |

An ADR's status changes from `Proposed` to `Accepted` the same moment its underlying DEC does (per A-001), not before and not automatically — a Product Owner accepting DEC-008 makes ADR-0001 `Accepted`; it does not retroactively accept any other ADR.

| Decision | Subject | Implementing packages | Freeze gate | State |
|---|---|---|---|---|
| DEC-001 | Core license | A-006, E-010 | E0 | proposed |
| DEC-002 | Commercial model | E-003–010 | E0 | proposed |
| DEC-003 | One school per installation | B-001–015 | A0 | proposed |
| DEC-004 | Base product boundary | A-002, A-007, C-004 | A0 | proposed |
| DEC-005 | Cambodia-first locale | B-014, E-007, cross-cutting UX | A0 | proposed |
| DEC-006 | Offline-capable operation | C-007, D-005, E-004–006 | E0 | proposed |
| DEC-007 | Controlled publishing | F-001–008 | F0 | proposed |
| DEC-008 | Railway plus Compose hosting | B-005–015 | B0 | proposed |
| DEC-009 | Payment adapters | E-007–010 | E1 | proposed |
| DEC-010 | Volume then S3 storage | B-012, B-015 | B0 | proposed |
| DEC-011 | Reviewed signed in-process plugins | C-001–008 | C0 | proposed |
| DEC-012 | Opt-in operational telemetry | A-004, B-009, D-007 | D0 | proposed |
| DEC-013 | Ed25519 offline entitlement | E-004–006 | E0 | proposed |

Acceptance format for each decision:

```text
Decision: DEC-xxx
Result: accepted | replaced | rejected
Replacement text: <required when replaced>
Approver: <product owner name>
Date: YYYY-MM-DD
Affected packages: <IDs>
Notes: <legal, security, migration, or commercial constraints>
```

Implementation may prepare reversible foundations while a decision is proposed, but no package may pass its listed freeze gate until the decision has an approver and date.
