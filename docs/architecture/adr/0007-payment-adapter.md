# ADR-0007: Payment Adapter

Status: **Proposed** — implemented as the Version 1 default; formal acceptance is blocked on **DEC-009** at Gate **E1**.

## Context

Cambodia-first launch (DEC-005) means card-network payment infrastructure cannot be assumed to be reliable or even available to every customer on day one, but the platform still needs a real, auditable settlement path for paid official plugins from the start. The payment surface also needs to support a second, different provider later without re-deriving the commerce ledger.

## Decision

**A single provider-adapter interface behind the same order/payment/entitlement ledger; manual/offline invoice first, a Stripe-compatible card adapter second.**

- `E-007` implements the provider-adapter interface and the **manual invoice adapter**: an admin records a settlement against an order, and it flows through the exact same `CommerceService` ledger as an online payment — verified to share invariants with online settlement, not a separate code path bolted on beside it.
- `E-008` implements the **online payment webhook adapter**: authenticity, replay, duplicate, out-of-order, and retry are all tested; raw provider events are retained (`PaymentWebhookEvent.rawPayload`) for dispute evidence and audit, not discarded after processing.
- Both adapters obey the same invariants (§11.3 of the master plan): client return URLs never mark an order paid (only a verified provider event or an authorized manual settlement does); every provider event has a unique idempotency key and is processed transactionally; money is integer minor units plus ISO currency, never floating point; order totals are computed server-side from versioned price records; entitlement issuance follows a committed payment state and is itself idempotent; refund/dispute events append ledger entries rather than rewriting history.
- Refund, dispute-forced reversal, for-cause revocation, and an overdue-expiry sweep (`E-009`) all reuse this same transactional ledger and fail closed against terminal states — live-verified end to end on disposable PostgreSQL (22/22 checks, [gate-e-refund-dispute-revocation-postgres-2026-08-28.md](../../acceptance/gate-e-refund-dispute-revocation-postgres-2026-08-28.md)).

## Consequences

- A school or customer without card-payment access on day one is not blocked from purchasing official plugins — the manual invoice path is a first-class settlement method, not a fallback grudgingly supported.
- Adding a second (card-network) provider later is additive: a new adapter implementing the same interface, feeding the same ledger — it should not require touching the entitlement issuance or refund/dispute logic, since those already only depend on "a payment reached a committed state," not on which adapter produced it.
- The specific card-network processor for the second adapter is **still unselected** — `technical-inventory.md`'s External Providers table was corrected during the A-002 audit to reflect that the manual/webhook shape exists today, while a real card-network processor remains an open choice, not a documentation gap.
- Every payment-adapter credential (webhook secrets, provider API keys) follows [secrets-inventory.md](../../operations/secrets-inventory.md)'s custody/rotation/redaction rules — no provider credential is a hidden requirement for core school operation (per §13.6), since payment only gates *paid official plugins*, never the base product.

## Alternatives considered

- **Card-network processor first, manual invoice as an afterthought**: rejected — would leave customers without reliable card infrastructure unable to purchase anything at launch, contradicting the Cambodia-first launch decision (DEC-005).
- **A payment-provider-specific ledger schema** (e.g., modeling orders around one specific processor's object model): rejected — would make adding the second provider a rewrite instead of an additive adapter, and was exactly the risk the shared `CommerceService` ledger was built to avoid.

## Related

[DEC-009](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [ADR-0006 licensing](./0006-licensing.md) · [data-classification.md](../data-classification.md) (Commerce bucket) · [secrets-inventory.md](../../operations/secrets-inventory.md) · [refund-policy-v1.0.md](../../policies/refund-policy-v1.0.md)
