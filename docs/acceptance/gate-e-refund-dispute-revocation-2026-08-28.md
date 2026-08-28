# Gate E Refund, Dispute, and Revocation Evidence — 2026-08-28

## Result

E-009 (refund, dispute, expiry, and revocation) is implemented on top of the E-007/E-008 payment ledger. Every reversal path is a status transition on existing rows plus an immutable `MarketplaceRefund` audit entry — no order, payment, or entitlement row is ever deleted. Live PostgreSQL application of the new migration and the F-009 payout reconciliation it feeds remain open, so Gate E3 is still not closed.

## State-machine invariants

- Refunding reuses the exact lookup/validation path a settlement uses: `PENDING` and already-terminal orders are rejected before any write.
- Refunding an order twice returns the original `MarketplaceRefund` row instead of creating a second one or re-updating already-settled state.
- An entitlement that already left `ACTIVE` (expired, revoked, or previously refunded) is left untouched by a later refund on the same order — no destructive overwrite of a more specific outcome.
- A dispute is recorded through the same signed, replay-protected webhook envelope as `payment.succeeded`/`payment.failed`. Opening a dispute never changes order, payment, or entitlement state by itself.
- Closing a dispute as `won` only marks the dispute resolved. Closing a dispute as `lost` calls the identical reversal used by an admin refund, except affected entitlements move to `REVOKED` instead of `REFUNDED`, so a forced chargeback is distinguishable from a customer-initiated refund in every downstream report.
- Closing a dispute that was never opened, or closing one twice, fails closed rather than guessing at intent.
- Explicit for-cause entitlement revocation is independent of order/payment state and fails closed (`409`) against any entitlement not currently `ACTIVE`.
- Entitlements now persist their own `expiresAt` (previously only inside the signed token); the overdue-expiry sweep is a single conditional `UPDATE ... WHERE status = 'ACTIVE' AND "expiresAt" < now()` and cannot affect a row already in a terminal state.

## Automated verification

```text
Test Suites: 6 passed, 6 total
Tests:       37 passed, 37 total
TypeScript build: passed
Prisma schema validation: passed
```

New coverage: paid-order refund and its idempotent retry, refusal to refund a non-`PAID` order, a refund leaving an already-terminal entitlement untouched, dispute-forced reversal marking entitlements `REVOKED`, for-cause revocation and its refusal against a terminal entitlement, the overdue-expiry sweep, and the four new webhook-driven dispute paths (opened, duplicate-opened, closed-won, closed-lost, close-without-open).

## Open items

- The `20260828070000_commerce_reversal_lifecycle` migration has not yet been applied to a live PostgreSQL instance in this environment (no database access this session). It must be verified on disposable Railway PostgreSQL 18 before this gate closes, following the same procedure as the prior three migrations.
- Customer identity/MFA (E-001) and publisher revenue/payout reconciliation (F-009) remain outside this increment's scope.
- No background scheduler exists yet for `POST /admin/v1/entitlements/expire-overdue`; it is operator- or cron-triggered until Gate D operations tooling adds one.
