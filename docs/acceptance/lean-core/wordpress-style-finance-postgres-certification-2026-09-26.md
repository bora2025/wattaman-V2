# WordPress-style Finance PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Accounting boundary

Finance `0.1.1` adds an immutable compensating reversal ledger. Reversing a payment does not update
or delete the original receipt. It creates one `plugin_wattanam_finance_payment_reversal` row,
reduces the fee aggregate in the same locked transaction, and republishes the student balance.
The operation requires `wattanam.finance.payments.reverse`, distinct from payment recording.

All values remain safe integer minor units with an explicit ISO currency. School operational fees
remain separate from marketplace/platform subscription billing.

## Certification command

`npm run certify:finance:postgres` requires the exact
`FINANCE_CERTIFY_ALLOW_DROP=finance-only` guard and then:

- discovers and removes only Finance-namespaced certification tables;
- verifies and applies all four immutable migrations by checksum and identity header;
- activates the real Finance plugin against PostgreSQL;
- validates the extension-driven dashboard contribution;
- creates a fee only for a student enrolled on its due date;
- rejects a fee for a non-enrolled student;
- races two payments against one balance and proves row locking permits only one overdraw-risk
  payment;
- captures the receipt before reversal and proves every selected receipt field is identical after
  reversal;
- proves a single compensating reversal row restores the outstanding balance;
- rejects a second reversal for the same receipt; and
- verifies the privacy-minimized student balance projection reflects the reversal.

The PostgreSQL 16 PR backend job runs this command after Transportation.

## Local verification

- Certification guard and immutable migration harness: 2 passed.
- Exact-only currency conversion and preflight: 7 passed.
- Backup-bound adoption, crash resume, reconciliation and rollback: 4 passed.
- Finance source and runtime behavior suites: 8 passed.

## Remaining acceptance gap

The first hosted PostgreSQL run, restored-backup execution, approved historical currency policy,
receipt browser/print parity, budget/report parity, finance/security/privacy and retention approval,
portable backup/restore, lifecycle testing and a controlled school pilot remain required before
production cutover.
