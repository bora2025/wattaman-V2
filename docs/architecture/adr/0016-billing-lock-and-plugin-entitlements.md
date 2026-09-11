# ADR-0016: Platform Billing Lock and Plugin Entitlements

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-009**. Amends one consequence of [ADR-0006](./0006-licensing.md).

## Context

A school can now be restricted by two unrelated mechanisms.

**The platform billing lock (whole school).** It is built and deployed as the [nonpayment-lock plan](../../marketplace/school-nonpayment-lock-plan.md) describes, with policy decided on 2026-09-10:
- the marketplace decides `ACTIVE` or `SUSPENDED`, and the school fetches that decision every hour (`school-billing-control.service.ts:24-45`);
- a global guard answers 402 to everything except sign-in, health, the bill and the SUPER_ADMIN's data export;
- the grace period is three days after the final notice;
- the lock lifts after seven days without a successful sync.

**Plugin entitlements (per plugin).** These are Ed25519-signed, installation-bound tokens (DEC-013):
- verified locally (`entitlement-verification.ts`) and cached in `PluginEntitlementCache`;
- carrying `issuedAt`, `notBefore`, `expiresAt`, `updatesThrough` and `offlineRecheckAfter`;
- with a default offline refresh grace of 30 days.

Drafting this record surfaced four gaps between the code and lean-core plan 12.8:

1. **The school does not verify the lock decision itself.** Its request to the marketplace is signed with the installation key, but the response is accepted over HTTPS with only its shape checked (`school-billing-control.service.ts:35-45`).
2. **Nothing rejects an older document.** Entitlement refresh and offline import both store any token that verifies, without comparing it to the one already cached (`entitlement-cache.service.ts:74-79, 108-113`). An older token still inside its validity window can therefore replace a newer one, including by offline import after the marketplace has stopped issuing it.
3. **There is no clock-skew allowance.** A token whose `notBefore` is one second ahead of the school's clock is rejected (`entitlement-verification.ts:62`).
4. **ADR-0006 is out of date.** It says "Core itself has no entitlement gate", and that "a school that never pays for anything still has a fully functional core system". The nonpayment lock the product owner approved contradicts both.

## Decision

1. **Two separate state machines, never conflated.**
   - *Platform subscription* (whole school): `ACTIVE` → final notice → three days' grace → `SUSPENDED` → `ACTIVE` on payment, plus operator suspend and terminate. Effect: the whole-school lock under the nonpayment-lock policy.
   - *Plugin entitlement* (one plugin): `ACTIVE` → `GRACE` → `EXPIRED`, or `REVOKED`. Effect: that plugin only.

   A marketplace outage, a payment-provider outage and revoked ownership each map to their own state and their own message; none is ever shown as another.
2. **The nonpayment-lock policy becomes core behaviour**, and ADR-0006 is amended: core has no *plugin* entitlement gate, but the platform subscription can lock the whole school.
3. **An expired paid plugin goes read-only; it never disappears.**
   - After `updatesThrough`, it receives no updates.
   - After `expiresAt` plus the offline grace, its routes refuse writes and its jobs stop; its pages, reads and exports keep working.
   - It cannot be newly activated or reinstalled without a valid entitlement.
   - Its data is never deleted ([ADR-0014](./0014-plugin-data-preservation.md)).
4. **Foundation plugins are included in the platform subscription.** A plugin that others require, Academic Management first, is never licensed separately, so one lapsed licence cannot switch off everything built on it.
5. **Every decision document is signed and versioned.**
   - The marketplace signs the school-control response with Ed25519, as it already signs entitlements.
   - Every entitlement and control document carries a generation number that increases for each subject.
   - The school rejects any document older than the one it holds, on refresh and on offline import alike.
6. **Clock skew.** Time signed by the marketplace is authoritative. `notBefore` and `issuedAt` are accepted up to 5 minutes in the future, and a school clock more than 5 minutes off the marketplace's shows in health.
7. **Offline grace stays as it is.** Plugin entitlements keep DEC-013's 30-day default, and the whole-school lock keeps its seven-day outage rule. Both are deliberately set so an outage favours the school.
8. **Last-known-good and a reason.** The school keeps the last verified document for each mechanism, and every transition is audited with its reason.

## Consequences

- Points 5 and 6 are code changes to both the marketplace and the school (LC-2 work); current behaviour stays until then.
- A plugin now has three runtime states (active, read-only, disabled). The plugin host enforces them centrally, at route dispatch and in the job runner, rather than trusting each plugin to.
- Point 4 is a pricing constraint: Academic Management cannot be sold on its own.

## Alternatives considered

- **An expired plugin keeps working fully; only updates stop.** This is DEC-002's model for core and the kindest to schools, but it makes every plugin licence effectively perpetual.
- **An expired plugin is disabled entirely.** The simplest to build, but the school loses sight of its own records until it exports them, and disabling a dependency stops everything built on it.

## Related

[Nonpayment-lock plan](../../marketplace/school-nonpayment-lock-plan.md) · [ADR-0006](./0006-licensing.md) · [DEC-002, DEC-013](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [Lean-core plan 12.8](../wattanam-lean-core-plugin-first-plan.md)
