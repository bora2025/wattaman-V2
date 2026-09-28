# Existing-school Human Resources restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution and specialist approval pending**

The guarded synthetic gate covers all six legacy datasets: profile, education, work experience,
certification, salary and staff attendance. It uses exact-only USD conversion with minor exponent 2
and does not constitute payroll, privacy or historical-currency approval.

Backup, isolated restore, immutable migrations, zero-write dry run, one-row adoption chunks, exact
reconciliation and routing rollback passed. Source and target fingerprints matched exactly:

`edb61800370e2515262321da72ed680a272c9e6d7f05cd26c6c190241715c7f0`

Legacy and plugin data remained intact. PostgreSQL date/timestamp and JSON binding plus target-date
canonicalization are now regression-tested. The machine result deliberately records
`specialistApproval: false` in
`wordpress-style-existing-school-human-resources-result-2026-09-28.json`.

Required PR validation now runs this gate. Remaining work includes hosted-backup execution,
production currency/provenance review, employee/manager row scope, payslip and audit controls,
browser lifecycle validation, privacy/payroll/security approval, and pilot evidence.
