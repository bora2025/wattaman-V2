# Changelog

## 0.2.2

- Add covering indexes for 2 foreign keys (migrations 005-006) so lookups, cascades and parent deletes stay fast as school data grows. Additive only; no data changes.

## 0.2.1

- Declare the student fee-balance read model and the database transaction capability.

## 0.2.0

- Upgrade fee management and finance settings to the universal SDK 1.3 declarative UI contract.

## 0.1.3

- Cast restored receipt amounts explicitly during compensating reversals on PostgreSQL.

## 0.1.2

- Declare financial data, backup/restore and retention behavior and expose runtime health.

## 0.1.1

- Add an immutable, additive payment-reversal ledger with a distinct segregation-of-duties permission.
- Expose reversal state beside immutable receipts without mutating or deleting receipt rows.
- Add extension-driven dashboard metadata and guarded PostgreSQL certification.

## 0.1.0

- Add minor-unit fee records, immutable receipt payments and invoice settings.
- Add transactional payment/balance updates and enrollment validation.
