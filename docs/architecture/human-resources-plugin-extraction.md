# Human Resources plugin extraction worksheet

Status: normalized employee/CV, payroll and staff-attendance foundation plus a guarded six-dataset
exact-only adoption/reconciliation/rollback toolkit implemented locally. Version 0.1.2 publishes
an actor-free staff attendance projection for Reporting and a title-only document profile for
Document Designer; restored-backup execution,
privacy/payroll approval and lifecycle certification remain open.

## Ownership boundary

`wattanam.human-resources` owns employee profiles, CV history, salary/payroll and staff attendance.
Core owns login identity; HR stores stable Directory user IDs and rejects student/parent identities.
Academic Management owns academic staff assignments, Finance owns student fees, Attendance Manager
owns student school-day attendance, and Timetable owns teacher lesson attendance.

## Implemented foundation

Version 0.1.0 defines six namespaced tables without cross-boundary foreign keys: employee profile,
education, work experience, certification, salary and staff attendance. CV replacement is bounded
and transactional. Payroll uses explicit currency and integer minor units. It follows DRAFT →
APPROVED → PAID and enforces creator/approver/payer segregation. Staff attendance validates the
Directory role and uses a unique employee/date/session key. Five permissions and host-rendered CV,
payroll and attendance pages keep profile, payroll approval and attendance authority distinct.

## Remaining gates

1. Approve payroll currency/exponent, blocked historical rows and the missing independent-approver
   provenance policy; the existing preflight never rounds implicitly.
2. Execute the six-dataset backup-bound adoption and rollback toolkit against a restored
   production-like PostgreSQL backup.
3. Add employee self-service row scope and manager/department authorization.
4. Add payroll adjustment/void audit events, payslip rendering and retention/export controls.
5. Complete privacy, payroll, security, PostgreSQL concurrency, hosted lifecycle and pilot approval.

## Adoption preflight

`human-resources-adoption-preflight.js` reads all six legacy datasets in deterministic chunks,
normalizes dates and identities, applies exact-only payroll conversion, verifies net salary and
emits privacy-safe fingerprints. It is read-only, refuses non-empty targets and warns that the
legacy payroll model cannot prove independent approval. The focused suite passes 7 tests; see
[MP8 Human Resources adoption preflight evidence](../acceptance/mp8-human-resources-adoption-preflight-2026-09-25.md).
The guarded adoption suite passes 4 more tests covering backup/policy binding, zero-write dry-run,
crash resume, exact six-dataset reconciliation and metadata-only rollback.
