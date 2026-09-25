# MP8 Human Resources adoption preflight evidence — 2026-09-25

Status: local preflight and guarded adoption/rollback toolkit implemented and verified; production
adoption is not certified.

## Scope

The preflight inventories all six legacy HR datasets: staff profiles, education, work experience,
certifications, salaries and staff attendance. It normalizes them to the Human Resources 0.1.0
schema in stable ID order, produces deterministic counts and SHA-256 fingerprints, and checks that
the six target tables exist and are empty. It performs no writes.

Salary values use the shared exact-only major-to-minor converter. Rounding, unsafe integers,
unknown currency exponents, non-reconciling net salary and paid rows without `paidAt` block
readiness. A permanent provenance warning records that the legacy payroll model has no independent
approver identity; paid rows therefore require explicit payroll review before adoption.

The report excludes employee names, profile summaries, work descriptions, salary notes and scan
location labels.

## Verification

```text
cd backend
npm run test:human-resources:preflight
```

Result: 7 tests passed, 0 failed. Coverage includes six-dataset inventory, privacy-safe output,
exact conversion, monetary rounding and net-reconciliation blockers, missing paid timestamp,
non-empty targets, unknown currency handling and batch-size-independent fingerprints.

The guarded adoption suite passes 4 additional tests. Its zero-write dry-run binds the approved
source fingerprint, currency/exponent, school slug and verified backup. The write path is chunked,
idempotent and journaled, resumes after a simulated crash, rejects a changed conversion policy,
re-checks the source and requires exact six-dataset target reconciliation. The metadata-only
rollback drill preserves both legacy and plugin datasets and keeps the missing legacy-approver
warning in the adoption journal.

## Remaining acceptance work

- Payroll and privacy approval of currency/exponent and historical paid-row provenance policy.
- Execution against a restored production-like PostgreSQL backup.
- Self-service/manager row scope, payslip/adjustment/void controls and retention/export review.
- Hosted lifecycle, concurrency and controlled-pilot certification.
