# LC-0 Architecture Decisions

Status: **drafted; awaiting product-owner decisions. Nothing in this record is accepted.**  
Drafted: 2026-09-11  
Checklist: [Gate LC-0](../../architecture/lean-core-plugin-implementation-checklist.md#gate-lc-0--approve-architecture-decisions)

LC-0 is the gate before any module extraction. It closes when:
- all thirteen decisions below are accepted or replaced, each with an approver and a date;
- [module-boundaries.md](../../architecture/module-boundaries.md) and the master plan agree with them.

This record is that evidence. It is also the governance record LC0-013 asks for.

## The decisions

Each draft gives context from the current code, a recommendation, the alternatives, and what changes on acceptance. Recommendations follow the lean-core and migration plans, except where marked **refines** or **departs**. Read those most closely.

| Item | Record | Recommendation | Provisional items |
|---|---|---|---|
| LC0-001 | [ADR-0009](../../architecture/adr/0009-lean-core-product-boundary.md) | Lean core plus plugin-first is the target; fresh schools default to core only | — |
| LC0-002 | [ADR-0009](../../architecture/adr/0009-lean-core-product-boundary.md) | DEC-004 is replaced with the lean-core base-product text | — |
| LC0-003 | [ADR-0010](../../architecture/adr/0010-identity-ownership.md) | Core owns accounts, contacts, membership and roles; Academic Management owns student profiles and classes; HR owns employee profiles. **Refines:** core also owns the guardian link | 51 |
| LC0-004 | [ADR-0011](../../architecture/adr/0011-plugin-ui-declarative-v2.md) | Declarative UI v2 rendered by core; no plugin JavaScript in the core origin | — |
| LC0-005 | [ADR-0012](../../architecture/adr/0012-plugin-runtime-trust.md) | Only official and approved publishers while execution is in-process | — |
| LC0-006 | [ADR-0013](../../architecture/adr/0013-plugin-artifact-delivery.md) | Digest-addressed artifacts; each API and worker role verifies its own cache; rollout generations. **Refines:** offline import only from a school's own recovery set | — |
| LC0-007 | [ADR-0014](../../architecture/adr/0014-plugin-data-preservation.md) | Disable and uninstall preserve data; only a separate, confirmed purge deletes it | — |
| LC0-008 | [ADR-0015](../../architecture/adr/0015-cross-plugin-event-consistency.md) | Transactional outbox, idempotent consumers, retries and dead letters; no cross-plugin transactions | — |
| LC0-009 | [ADR-0016](../../architecture/adr/0016-billing-lock-and-plugin-entitlements.md) | Separate the whole-school lock from plugin licences; signed, versioned documents that reject replays. **Refines:** an expired paid plugin goes read-only, and foundation plugins are included in the subscription | — |
| LC0-010 | [ADR-0017](../../architecture/adr/0017-compatibility-windows.md) | Concrete windows for core, SDK, Node, PostgreSQL, browsers and mobile | — |
| LC0-011 | [ADR-0018](../../architecture/adr/0018-communication-scope.md) | **Departs:** keep `wattanam.announcements` standalone; Communication owns messages and posts; sell both as one bundle | 46 |
| LC0-012 | [ADR-0019](../../architecture/adr/0019-attendance-ownership.md) | Students to Attendance, staff to HR, course sessions to Learning. **Departs:** lesson (timetable teacher) attendance to Timetable | 131 |
| LC0-013 | this record | Approver, date, rationale and superseded documents, recorded below | — |

LC0-001 and LC0-002 share one record, the way ADR-0006 records both DEC-001 and DEC-013. MP1-002 (does the LaTeX editor belong to Document Designer?) also holds 4 provisional items, but it belongs to wave MP-1, not to this gate.

## What drafting found in the code

The records were checked against the code, not only the plans. That turned up facts that matter however the decisions land:

- **Node 20 reached end-of-life on 2026-04-30.**
  - The backend, marketplace API and platform admin images still build on it.
  - The frontend image uses Node 24.
  - CI runs Node 20 for everything.

  See ADR-0017.
- **The school does not verify the marketplace's billing-lock answer.** Its request is signed, but the response is trusted as returned over HTTPS (ADR-0016).
- **Entitlements have no anti-downgrade check and no clock-skew allowance.** An older, still-valid token can replace a newer one, including by offline import (ADR-0016).
- **ADR-0006 contradicts the approved nonpayment lock.** It says core never locks for payment; ADR-0016 amends it.
- **Plugin events live in memory only.** They are lost on restart and never cross from the API process to the worker (ADR-0015).
- **DEC-006 and the lean-core plan disagree about offline package import** (ADR-0013).

Drafting changed none of these; each is recorded in the ADR that addresses it.

## How to decide

For each decision, reply accept, change (and say what), or reject. A change is written into the ADR before acceptance, so the accepted record says exactly what was agreed. Each decision is then recorded here in the ADR index's format:

```text
Decision: LC0-xxx (ADR-00xx)
Result: accepted | replaced | rejected
Replacement text: <required when replaced>
Approver: <product owner name>
Date: YYYY-MM-DD
Affected packages: <IDs>
Notes: <legal, security, migration or commercial constraints>
```

## Governance record (LC0-013)

| Item | Result | Approver | Date | Rationale and notes |
|---|---|---|---|---|
| LC0-001 | pending | | | |
| LC0-002 | pending | | | |
| LC0-003 | pending | | | |
| LC0-004 | pending | | | |
| LC0-005 | pending | | | |
| LC0-006 | pending | | | |
| LC0-007 | pending | | | |
| LC0-008 | pending | | | |
| LC0-009 | pending | | | |
| LC0-010 | pending | | | |
| LC0-011 | pending | | | |
| LC0-012 | pending | | | |
| LC0-013 | pending | | | |

### Superseded or amended on acceptance

| Document | Change | Triggered by |
|---|---|---|
| Master plan section 2, DEC-004 | Becomes `replaced`, with ADR-0009's text | LC0-002 |
| [module-boundaries.md](../../architecture/module-boundaries.md) | Rewritten from the ownership manifest; attendance and academic structure leave CORE | LC0-001, LC0-002 |
| [ADR-0004](../../architecture/adr/0004-plugin-trust.md) | Extended with ADR-0012's condition for opening to third parties and its mandatory release controls | LC0-005 |
| [ADR-0006](../../architecture/adr/0006-licensing.md) | Its "core has no entitlement gate" consequence is amended | LC0-009 |
| DEC-006 | Offline package import narrowed to a school's own recovery set | LC0-006 |
| [ownership-manifest.json](../../architecture/ownership-manifest.json) | `decisions` entries removed and the 228 LC-0 provisional owners made final; rules changed where ADR-0018 and ADR-0019 depart from the current split | LC0-003, LC0-011, LC0-012 |
| [ADR index](../../architecture/adr/README.md) | Each record moves from Proposed to Accepted | each |

## After the decisions

Once each decision has a result:
1. Write any changes into the ADRs, then fill in the governance table.
2. Update the superseded documents above.
3. Update the ownership manifest.
4. Regenerate the inventory, then run the gate and its tests.
5. Tick the LC-0 boxes in the checklist.

LC-2 (hardening the plugin foundation) starts after that.
