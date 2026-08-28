# Gate E Online Webhook Contract Evidence — 2026-08-28

## Result

The first online payment adapter now meets the E-008 authenticity, replay, duplicate, out-of-order, retry, and raw-event-retention contract. It uses the same transaction-level fulfillment service as manual invoices. Provider production selection, refund reconciliation, and finance certification remain open, so Gate E3 is not closed.

## Security and state invariants

- The provider signs `<unix-seconds>.<exact raw request body>` with HMAC-SHA256.
- Signature comparison is constant-time and occurs before a database transaction.
- Timestamps outside a five-minute tolerance fail authentication.
- Provider and event ID are unique; sequential and concurrent exact retries return the stored outcome without new fulfillment.
- Reusing an event ID with a different payload hash fails closed.
- Raw payload bytes are retained as base64 alongside signature, SHA-256, event type, order, receipt time, and process time.
- A success after a prior failure upgrades the same payment and fulfills the order once.
- A failure received after success is retained but cannot downgrade payment, order, or entitlement state.
- Provider amount and currency must match the server-owned order before fulfillment.
- Event evidence, payment, entitlement, and paid order state share one serializable transaction.

## Automated verification

```text
Test Suites: 6 passed, 6 total
Tests:       24 passed, 24 total
TypeScript build: passed
Prisma schema validation: passed
```

Tests cover invalid signature, stale valid signature, sequential and concurrent exact duplicates, event-ID collision, late failure after success, and success after failure through signed entitlement fulfillment.

## PostgreSQL 18 verification

The complete baseline, commerce, and webhook migration chain applied to clean disposable Railway PostgreSQL 18. Catalog inspection confirmed all webhook evidence columns, the unique `(provider, eventId)` index, and the `(orderId, receivedAt)` investigation index. Disposable service `Postgres-f5o-` (`d1718b3d-d0db-4c50-9162-18f212cbce00`) was deletion-requested and verified at `NO DEPLOYMENT` afterward.
