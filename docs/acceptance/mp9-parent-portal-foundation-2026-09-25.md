# MP9 Parent Portal foundation evidence — 2026-09-25

Status: local foundation verified; production migration is not certified.

The official 0.1.0 plugin owns only parent-link workflow data and stable Directory IDs. Parent child
access is reconstructed from dated Academic rosters. Optional domain sections use versioned read
models and fail independently when absent. Approval resolves a PARENT through an idempotent core
account command and assigns the guardian through the Academic ownership-aware command; both are
capability-gated and audited. New parent passwords are opaque unknown bcrypt values and never leave
core, forcing use of the password-reset path.

The read-model runtime now supports an optional server-side record key, preventing a composition
plugin from loading every student's projection and filtering locally. Parent Portal always uses the
linked student's key. Finance publishes a privacy-minimized `student-fee-balance` version 1 after
fee and payment mutations; it contains grouped minor-unit totals and due metadata only.

Verification:

```text
cd backend
npm test -- --runInBand src/plugins/plugin-account.service.spec.ts src/plugins/plugin-sdk-contract.spec.ts src/plugins/parent-portal-plugin-source.spec.ts src/plugins/parent-portal-plugin-behavior.spec.ts
```

Result: the original foundation scope passes 17 tests, and the keyed read-model plus Finance/Parent
integration scope passes 17 tests. The SDK package manifest suite also passes 8 tests.

Production PostgreSQL, the remaining optional source projections, adoption/rollback, hosted
browser/accessibility, backup/restore and lifecycle certification remain open.
