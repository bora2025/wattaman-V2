# Architecture Decision Record Index

The master plan DEC-001–013 is the decision register. This index maps each decision to implementation ownership and the gate that prevents an unapproved assumption from shipping.

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
