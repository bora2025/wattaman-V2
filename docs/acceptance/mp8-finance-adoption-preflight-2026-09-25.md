# MP8 Finance adoption preflight evidence — 2026-09-25

Status: local preflight and guarded adoption/rollback toolkit implemented and verified; production
adoption is not certified.

## Scope

The Finance adoption preflight inventories the legacy fee-record, fee-payment and fee-settings
datasets and normalizes them to the `wattanam.finance` 0.1.0 minor-unit schema without writing to
either source or target. It reports deterministic per-dataset counts and SHA-256 fingerprints,
checks that all target tables exist and are empty, and excludes student names, payment notes,
invoice contact values and receipt contents from the report.

Money conversion is deliberately exact-only. The operator must provide a three-letter currency;
the shared converter uses its approved ISO exponent or a separately supplied integer exponent.
Any value requiring rounding, any non-finite value, any unsafe integer result, or a currency whose
exponent is unknown blocks readiness. This does not constitute finance approval of a currency,
cash-rounding convention or historical ledger policy.

## Verification

Command:

```text
cd backend
npm run test:finance:preflight
```

Result: 7 tests passed, 0 failed.

The tests cover exact USD conversion, zero-decimal conversion, rejection of rounding, rejection of
unsafe integer values, explicit handling of unknown currency exponents, non-empty target blocking,
deterministic fingerprints and privacy-safe report output.

The guarded adoption suite additionally passes 4 tests. Its zero-write dry-run binds the approved
source fingerprint, exact conversion policy, school slug and verified recovery backup. The write
path is chunked, idempotent and journaled, resumes after a simulated crash, rejects a changed
conversion policy, re-fingerprints an unchanged source, and requires exact dataset-by-dataset target
reconciliation. The rollback drill changes routing metadata only and proves both financial ledgers
remain preserved.

## Remaining acceptance work

- Finance approval of the installation currency, exponent and any blocked historical rows.
- Compensating reversal support and historic receipt provenance decisions.
- Execution of the toolkit against a restored production-like PostgreSQL backup.
- Hosted browser/print, lifecycle, privacy, security and controlled-pilot certification.
