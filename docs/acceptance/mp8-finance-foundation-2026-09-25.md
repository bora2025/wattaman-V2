# MP-8 Finance foundation — local acceptance evidence

Date: 2026-09-25

Status: local foundation accepted; financial and production certification remain open.

- Three namespaced migrations pass the migration policy without cross-boundary foreign keys.
- Monetary columns are `BIGINT` minor units; no floating-point money exists in the plugin schema.
- Fee creation validates dated Academic enrollment and discount bounds.
- Payment creation locks the fee row and atomically persists a unique receipt and paid balance.
- Overpayments and non-integer input are rejected before any write.
- Receipt rows use restrictive deletion and no receipt-delete route exists.
- Declarative UI sources bind to same-permission runtime routes.

```text
Finance focused suites: 6 passed, 0 failed
```

This does not approve any legacy rounding/conversion policy and is not evidence of real PostgreSQL
concurrency, hosted reconciliation, finance approval, lifecycle or pilot readiness.
