# MP2 Study Year Boundary — Local Evidence

Date: 2026-09-16
Status: partial MP2 implementation, not plugin extraction certification

The `/study-years` controller retains its existing API. `StudyYearsService` now delegates through
`ACADEMIC_STUDY_YEARS_PROVIDER`; the Prisma adapter owns legacy table access and business rules.
The current-year command has a deterministic key and uses one database transaction with a
transaction-scoped advisory lock. It verifies the target exists before unsetting another current
year. This prevents a missing target or concurrent set-current requests from leaving inconsistent
current-year state.

Local verification: 3/3 focused tests pass; `tsc --noEmit` passes. No live PostgreSQL concurrency
drill or customer-school migration was performed.

Still required: namespaced StudyYear schema and adoption, class-count contract, plugin route/UI,
permission grants, backup-bound reconciliation, live rollback, and marketplace lifecycle proof.
