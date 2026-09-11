# ADR-0009: Lean Core Product Boundary

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-001** and **LC0-002**. This record replaces **DEC-004**.

## Context

DEC-004 (proposed, freeze gate A0) defines the base product as "identity, roles, students, staff, academic structure, attendance, audit, installation, backup, plugin host". [module-boundaries.md](../module-boundaries.md) (A-007) builds its CORE column on that text, so attendance, classes, study years and departments are classified as permanent core today.

Two things have moved since then:

- The [2026-08-29 decision brief](../../decisions/product-owner-decision-brief-2026-08-29.md) found DEC-004 had already been outgrown: the backend ships roughly three times the scope it names, so accepting it literally would imply an unstarted descoping project.
- The [lean-core plan](../wattanam-lean-core-plugin-first-plan.md) proposes the opposite direction: a fresh school receives only the platform foundation, and every business feature, attendance and academic structure included, becomes a signed official plugin.

LC-1 measured what that means in the current code (`docs/architecture/generated/current-architecture-inventory.json`):

| | Lean core | Official plugins |
|---|---|---|
| Nest modules | 18 | 22 |
| Prisma models | 21 | 61 |
| HTTP routes | 88 | 294 |
| Frontend pages | 25 | 111 |

179 references still run from core into feature code: module composition in `app.module.ts` and the mobile `App.tsx`, navigation arrays, dashboard API calls, and direct reads and deletes of feature tables. They are the LC-2 and LC-4 work list, not violations to fix before this decision.

## Decision

**LC0-001 — Lean core plus plugin-first is the target distribution.**

- Lean core is exactly the lean-core plan's section 6: installation and school identity; identity and access; the plugin platform; operations and safety; and the commercial connection (marketplace link, entitlement cache, platform billing lock and recovery).
- Everything else is owned by one of the twelve official plugins in [ownership-manifest.json](../ownership-manifest.json).
- A fresh installation defaults to core only. The setup wizard may recommend a starter bundle, but choosing one runs ordinary, audited plugin installs.
- From acceptance onward, no new business functionality is added to `backend/src` or to the core frontend; new optional features start as plugins. Fixes and already-planned work on existing modules continue until each module's cutover.
- Existing schools keep every current feature until that feature's cutover is verified (lean-core plan section 11). Nothing is removed in a single migration.

**LC0-002 — DEC-004 is replaced.** The acceptance record uses `Result: replaced` with this replacement text:

> Base product: installation and school identity; generic identity and access (accounts, contacts, roles, permissions, organization membership); the plugin platform; operations and safety (backup, restore, updates, audit, health, and the storage, notification, realtime and job infrastructure); and the commercial connection (marketplace link, entitlements, platform billing lock). Students, staff, academic structure, attendance and every other school business feature are official plugins.

## Consequences

- The DEC-004 mismatch the brief flagged is resolved toward the plan rather than by widening the base: the shipped scope becomes a migration target, not a ratified base.
- **This is the most expensive decision in LC-0.** Before the first business module can move (waves MP-0 to MP-5), extraction needs declarative UI v2 ([ADR-0011](./0011-plugin-ui-declarative-v2.md)), an Academic Management contract ([ADR-0010](./0010-identity-ownership.md)), durable events ([ADR-0015](./0015-cross-plugin-event-consistency.md)) and per-role artifact delivery ([ADR-0013](./0013-plugin-artifact-delivery.md)).
- Academic Management is the foundation the other academic plugins depend on, yet today it reaches into its dependants: deleting a class clears attendance, fees, exam attempts and parent requests directly (`classes.service.ts:237-244`). That drives the one dependency cycle LC-1 found, across 10 plugins. Keeping academic structure in core would not remove the coupling, only turn it into core-to-feature references. Either way it has to be replaced by events and contracts.
- [ADR-0006](./0006-licensing.md) says core has no entitlement gate and names DEC-004's scope. Both statements need amending: the scope changes here, and the nonpayment lock already restricts the whole school ([ADR-0016](./0016-billing-lock-and-plugin-entitlements.md)).

## Alternatives considered

- **Accept DEC-004 as written** (academic structure and attendance stay core). Attendance and Academic Management would never need extracting, which removes the two hardest waves. But every school would carry attendance and academic tables, pages and jobs whether it uses them or not, contradicting the core-only installation (plan section 7), and the coupling above would remain as core-to-feature references.
- **Widen DEC-004 to the shipped scope** (the brief's second option). No extraction at all, but the marketplace would sell plugins beside a core that already contains most features, and the plugin platform would stay unproven for anything larger than announcements.

## On acceptance

- Master plan section 2: DEC-004 becomes `replaced`, with the text above.
- [module-boundaries.md](../module-boundaries.md) is rewritten from the ownership manifest: `attendance`, `classes`, `study-years` and `departments` leave CORE; `session-config`, `holidays` and `card-aliases` leave SHARED for Attendance; `directory` changes as ADR-0010 describes.
- ADR-0006's "Core itself has no entitlement gate" consequence is amended by ADR-0016.

## Related

[Lean-core plan](../wattanam-lean-core-plugin-first-plan.md) · [Migration plan](../module-to-plugin-migration-plan.md) · [LC-1 record](../../acceptance/lean-core/lc1-current-state-inventory.md) · [LC-0 decision record](../../acceptance/lean-core/lc0-architecture-decisions.md) · [DEC-004](../../platform-master-execution-plan.md#2-product-and-architectural-decisions)
