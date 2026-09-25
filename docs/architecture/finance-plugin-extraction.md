# Finance plugin extraction worksheet

Status: minor-unit fee/receipt foundation and guarded exact-only adoption/reconciliation/rollback
toolkit implemented locally; restored-backup execution and financial/lifecycle certification remain
open.

## Ownership boundary

`wattanam.finance` owns student fee obligations, discounts, receipts, invoice settings and financial
summaries. Academic Management owns students and enrollment; Finance stores stable Academic student
IDs and validates enrollment through Directory. Core platform billing remains core and is never
mixed with a school's operational fee ledger. Human Resources owns salary and payroll.

## Implemented foundation

Version 0.1.0 defines three namespaced tables without core or cross-plugin foreign keys. Money uses
integer minor units and an explicit three-letter currency; floating-point values are rejected.
Payment creation locks the fee row, prevents overpayment, creates a unique immutable receipt and
updates the paid balance in one transaction. Receipt deletion is impossible and fee deletion is not
exposed. Four permissions separate viewing, fee management, payment entry and settings. Two
host-rendered pages cover fee creation/list/summary and invoice settings.

After fee and payment mutations, Finance publishes `student-fee-balance` read-model version 1,
keyed by Academic student ID. It exposes currency-grouped charged/paid/balance minor units, next due
date and record count without receipt notes, payer identity or cross-plugin table access. Keyed reads
are enforced by the core runtime for Parent Portal consumption.

## Remaining gates

1. Approve the installation currency/exponent and disposition of historical rows that the exact-only
   preflight blocks; no implicit rounding is permitted.
2. Add void/reversal as compensating entries, never receipt mutation or deletion.
3. Add budget/report parity, receipt rendering and parent read-only balance contract.
4. Execute the backup-bound adoption, exact reconciliation and rollback toolkit against a restored
   production-like PostgreSQL backup.
5. Complete finance/security/privacy audit, segregation-of-duties and retention approval.
6. Certify PostgreSQL concurrency, hosted browser/print, lifecycle, backup/restore and pilot behavior.

## Adoption preflight

`finance-adoption-preflight.js` reads the three legacy datasets in stable ID order, applies the
shared exact-only major-to-minor converter, validates relationships and required values, and emits
privacy-safe deterministic fingerprints. It performs no writes and refuses non-empty targets. The
focused suite passes 7 tests; see
[MP8 Finance adoption preflight evidence](../acceptance/mp8-finance-adoption-preflight-2026-09-25.md).
The guarded adoption suite passes 4 more tests covering zero-write dry-run, crash resume, immutable
conversion-policy binding, exact reconciliation and metadata-only rollback while retaining both
ledgers.
