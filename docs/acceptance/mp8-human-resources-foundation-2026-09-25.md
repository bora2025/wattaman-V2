# MP-8 Human Resources foundation — local acceptance evidence

Date: 2026-09-25

Status: local foundation accepted; organizational and production certification remain open.

Version 0.1.2 publishes `staff-attendance-summary` v1 after attendance mutations. The projection is
keyed by Directory user ID, limits its payload to recent date/session/status values, and excludes
the marking actor plus contact, profile and payroll data. Reporting consumes it through bounded
keyed reads; focused Human Resources and Reporting tests cover this privacy boundary.

It also publishes `staff-document-profile` v1 after CV updates. That projection contains only the
stable Directory user ID and title. Document Designer consumes it through bounded keyed reads and
combines it with Directory-owned name/role data; no CV narrative, history, contact or payroll data
crosses the plugin boundary.

- Six immutable namespaced migrations pass the migration policy.
- No HR table has a foreign key to core or another plugin.
- Student and parent Directory identities are rejected from employee workflows.
- Normalized CV child collections are bounded and replaced transactionally.
- Payroll uses integer minor units and rejects an invalid negative net amount.
- Payroll creator, approver and payer must be different actors.
- Staff attendance validates employee identity and uses conflict-safe date/session updates.
- Host-rendered data sources bind to runtime routes with the same permissions.

```text
Human Resources focused suites: 7 passed, 0 failed
Backend build: 317 files compiled
```

This is not legacy conversion, real PostgreSQL, hosted row-scope, payroll/privacy approval,
lifecycle, backup/restore or pilot evidence.
