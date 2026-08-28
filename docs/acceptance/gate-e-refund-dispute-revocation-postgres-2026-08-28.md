# Gate E Refund/Dispute/Revocation — Live PostgreSQL Evidence — 2026-08-28

## Result

E-009 (refund, dispute-forced reversal, manual revocation, overdue-expiry sweep) is verified against a real, disposable PostgreSQL 16 instance (Docker, not mocked), using the actual production classes (`CommerceService`, `PaymentWebhookService`) — not a simulation. All 22 live checks pass. This also closes the previously open item from [gate-e-refund-dispute-revocation-2026-08-28.md](./gate-e-refund-dispute-revocation-2026-08-28.md): migration `20260828070000_commerce_reversal_lifecycle` had only ever passed `prisma validate`/`generate`; it has now been applied to a live database via `prisma migrate deploy`, alongside the three prior marketplace migrations, with zero drift.

## What was verified live

Ran `prisma migrate deploy` against a fresh `postgres:16-alpine` container (all 4 marketplace-api migrations, including the target one, applied cleanly), then exercised the real service classes:

```text
== E-009: admin refund on real PostgreSQL ==
PASS refundOrder() marks the order REFUNDED
PASS order row is REFUNDED in the database
PASS payment row is REFUNDED
PASS admin refund sets entitlement status REFUNDED (not REVOKED)
PASS entitlement carries the refund reason
PASS retrying refundOrder() on an already-refunded order is idempotent
PASS exactly one MarketplaceRefund row exists after the idempotent retry

== E-009: dispute lost via authenticated webhook on real PostgreSQL ==
PASS dispute_opened webhook records an OPEN dispute row
PASS order is untouched while the dispute is merely open
PASS dispute_closed(lost) webhook triggers a reversal
PASS a lost dispute REVOKES the entitlement (not REFUNDED)
PASS the dispute-driven refund row is attributed to the dispute, not an admin
PASS dispute row is closed with status LOST and a resolvedAt timestamp

== E-009: dispute won via authenticated webhook on real PostgreSQL ==
PASS dispute_closed(won) does not produce a reversal
PASS order stays PAID after a won dispute
PASS entitlement stays ACTIVE after a won dispute

== E-009: manual entitlement revocation on real PostgreSQL ==
PASS revokeEntitlement() returns status REVOKED
PASS entitlement row is REVOKED with the given reason
PASS revoking an already-revoked entitlement is rejected, not silently repeated

== E-009: overdue entitlement expiry on real PostgreSQL ==
PASS expireOverdueEntitlements() leaves a not-yet-expired entitlement ACTIVE
PASS expireOverdueEntitlements() reports at least the one overdue entitlement
PASS the overdue entitlement is now EXPIRED

ALL CHECKS PASSED (22/22)
```

Notable things this specifically exercised that unit tests (mocked `tx`) cannot:
- The dispute scenarios settled the underlying order through the real HMAC-authenticated `PaymentWebhookService.process()` (`payment.succeeded` → `payment.dispute_opened` → `payment.dispute_closed`), including its live `PaymentWebhookEvent` replay-protection table and the real `provider_providerRef` unique constraint used to resolve a dispute back to its order.
- The idempotent-refund-retry path exercised the real `order.status === 'REFUNDED'` short-circuit in `reverseOrder`, confirmed by counting actual `MarketplaceRefund` rows (still 1) rather than counting mock calls.
- The overdue-expiry sweep used `installationEntitlement.updateMany` against real rows with a real `expiresAt` computed by `settleProviderPayment`, not an injected date.
- `MarketplaceRefund_amountMinor_check` and both new foreign keys (`MarketplaceRefund` → `MarketplaceOrder`/`MarketplacePayment`, `MarketplacePaymentDispute` → `MarketplacePayment`) were live database constraints during every insert, not schema-only assertions.

## Automated unit verification (mocked, part of the regular suite, unchanged by this session)

Referenced for completeness: `commerce.service.spec.ts` and `payment-webhook.service.spec.ts` already cover these same behaviors against mocked transactions (37 passing tests, noted in the MKT-002 baseline row); this document is the first time the same behavior was proven against a real database.

## Open items

- FL policy sign-off on the refund/dispute rules under DEC-002/DEC-009 has not happened — this is a business decision, not an engineering gap.
- No live verification exists yet for a dispute event arriving for a payment that was never settled online (settled manually instead) — `resolveOrderId`/`recordDisputeOpened` require a `provider: 'online-hmac-v1'` payment row, so a manually-settled order cannot currently receive a provider dispute webhook. This matches production reality (a manual/invoice payment cannot generate a card-network dispute) but was not explicitly asserted here.
- Publisher-payout reconciliation (F-009) remains out of scope for E-009 and untouched by this verification.
