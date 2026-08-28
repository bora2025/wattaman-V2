# Gate E Manual Settlement Contract Evidence — 2026-08-28

## Result

The manual-invoice adapter now uses the same marketplace order, payment, and entitlement ledger intended for online providers. This is implementation evidence for E-003, E-006, and E-007; it does not close Gate E3.

## Enforced invariants

- An order references an account, one registered installation, and immutable versioned server price records.
- The server calculates minor-unit totals; callers cannot submit unit prices or totals.
- Only active prices for approved paid products and the requested ISO currency can enter an order.
- Order creation has a unique idempotency key.
- Manual settlement runs at serializable isolation and records payment, signed entitlement, and `PAID` order state in one transaction.
- The settlement reference is unique per provider and cannot be moved to another order.
- Stored order totals, line snapshots, and price records must agree before fulfillment.
- A retry returns the existing payment and entitlement and performs no new writes.
- A paid order with incomplete fulfillment fails closed.

The authenticated routes are `POST /admin/v1/orders` and `POST /admin/v1/orders/:orderId/manual-settlement`. A customer checkout route awaits E-001 identity/session authorization.

## Verification

From `apps/marketplace-api`:

```text
npm.cmd test
Test Suites: 5 passed, 5 total
Tests:       17 passed, 17 total

npm.cmd run build
tsc -p tsconfig.json
exit code 0

DATABASE_URL=<syntactically valid PostgreSQL URL> npm.cmd run db:validate
The schema at prisma/schema.prisma is valid
```

The local Docker daemon was unavailable, so the forward migration has schema validation but not yet a clean PostgreSQL apply/rollback drill. That runtime evidence remains open and is not implied by this note.
