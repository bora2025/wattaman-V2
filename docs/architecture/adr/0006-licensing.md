# ADR-0006: Core Licensing Model

Status: **Proposed** — implemented as the Version 1 default; formal acceptance is blocked on **DEC-001** at Gate **E0**.

## Context

"Licensing" here means two related but distinct things, and this ADR covers both because A-003 names "licensing" as a single subject: (1) the legal distribution model for the core product itself, and (2) the technical entitlement mechanism that enforces which paid plugins/features an installation may use. DEC-013 (entitlement token format) is the technical half; DEC-001 (core license) is the legal half. They're recorded together here since they compose into one coherent story: the core product is licensed one way, official paid plugins are licensed and enforced a different, offline-tolerant way.

## Decision

**Core distribution (DEC-001): proprietary commercial distribution; the customer retains contractual data-export rights.** The core school platform is not open-source. A school's ability to export its own data is a contractual guarantee, not conditional on the software's license type — this matters because DEC-006 (offline-first) and DEC-010 (storage) both assume a school always has access to its own data regardless of subscription or connectivity state. No `LICENSE` file exists in the repository root today because the product is not distributed under an open-source license; the actual license terms are a commercial agreement, not a source-code artifact — see [ADR-0007's](./0007-payment-adapter.md) sibling document [terms-of-service-v1.0.md](../../policies/terms-of-service-v1.0.md) (A-006) for the drafted customer-facing terms.

**Entitlement mechanism (DEC-013, `E-004`): Ed25519-signed canonical-JSON tokens, installation-bound, with a default 30-day offline refresh grace period.** A token carries schema version, token ID, installation ID, customer ID, product/plugin ID, licensed major-version range, issued/not-before/expiry timestamps, an update-access end date, an offline recheck deadline, feature flags, issuer, key ID, and a nonce (§11.2 of the master plan). Verification is local — an installation does not call the marketplace on every request to check its own license. The entitlement signing key is distinct from the repository (package-signing) key (`D-002`/[secrets-inventory.md](../../operations/secrets-inventory.md)), so compromising one cannot forge the other.

## Consequences

- **Subscription expiry degrades gracefully, it never destroys data.** Per §11.2's explicit rule, expiry ends *updates and support* after the grace period; it does not erase data or silently disable essential read/export behavior. This is a load-bearing product promise, not an incidental detail — it's what makes the entitlement model compatible with DEC-006's offline-first requirement (E-005: a marketplace outage or expiry leaves the school's cached entitlement/functionality untouched — verified fail-open on outage, fail-closed only on cryptographic trust failure).
- **Core itself has no entitlement gate.** The base product (DEC-004's scope: identity, roles, students, staff, academic structure, attendance, audit, installation, backup, plugin host) never checks a license token to keep running — only *paid official plugins* are entitlement-gated. A school that never pays for anything still has a fully functional core system.
- A refund or for-cause revocation stops future downloads/renewals; it is explicitly **not** the same action as a security emergency-disable, which is a distinct signed advisory process (D-006) — conflating the two would mean a routine refund could accidentally look like a security incident, or vice versa.
- Because verification is local and offline-tolerant, a compromised entitlement private key is a serious incident (forged licenses for any installation) with no built-in "call home and revalidate everything" recovery — recovery relies on key rotation with an overlap window, the same mechanism already live-drilled for the repository key (`D-002`) but not yet drilled for the entitlement key (a gap [secrets-inventory.md](../../operations/secrets-inventory.md) already flags).

## Alternatives considered

- **Server-side entitlement checks on every request**: rejected — directly contradicts DEC-006 (offline-first); a school with no internet connectivity that day would lose access to paid functionality it already owns.
- **Open-source core with paid-plugin upsell only**: this was a real fork in the road (it would remove the "core distribution" half of this ADR entirely) but is not the Version 1 default; DEC-001 remains `proposed` specifically because this is a business decision, not an engineering one — this ADR records the current default, not a foreclosed alternative.

## Related

[DEC-001](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [DEC-013](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [ADR-0007 payment adapter](./0007-payment-adapter.md) · [ADR-0008 telemetry](./0008-telemetry.md) · [terms-of-service-v1.0.md](../../policies/terms-of-service-v1.0.md) · [secrets-inventory.md](../../operations/secrets-inventory.md)
