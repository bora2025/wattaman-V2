# Parent Portal plugin extraction worksheet

Status: parent-link workflow, serialized resolution, optional read-model composition and guarded
legacy adoption toolkit implemented locally. PostgreSQL concurrency/composition certification is
enforced in CI; its first hosted run, restored-backup execution and lifecycle certification remain
open.

## Ownership boundary

`wattanam.parent-portal` owns parent-link requests, approval workflow and parent-facing composition.
Core owns accounts and authentication. Academic Management owns the student profile and guardian
relationship; Parent Portal writes it only through the audited guardian command. Attendance,
Finance, Examination, Transportation and Communication own their data and may publish versioned
student-keyed read models. Parent Portal never reads their tables.

## Implemented foundation

Version 0.1.2 has one namespaced workflow table, three granular permissions, three host-rendered
pages and routes for roster-scoped children, student link requests, admin review and optional child
overview adapters. Missing optional plugins or projections degrade section-by-section.

Read-model lookup is server-side key scoped: after proving the child relationship, Parent Portal
requests only that student's record. Attendance publishes `student-attendance-summary`, Finance
publishes `student-fee-balance`, Examination publishes `student-grade-summary`, and Transportation
publishes `student-transport-summary`, and Communication publishes `student-communication-summary`,
all at version 1 after committed mutations. These projections
intentionally omit attendance device/location details, receipt notes and payer identity, exam
answers/keys/formulas/feedback/grading notes, transportation driver identity/location history, and
communication message content/participants/recipient lists.

Two SDK 1.1 capabilities provide the required canonical mutations. `accounts.parent.resolve`
idempotently resolves an existing PARENT or creates one with an opaque unknown bcrypt credential;
the new account must use core password recovery. `accounts.guardian.assign` invokes the existing
Academic ownership-aware guardian command. Both operations are capability-gated and audited.

## Remaining gates

1. Backfill and hosted-certify the locally implemented Attendance, Finance, Examination,
   Transportation and Communication version 1 projections and test mixed installed subsets.
2. Execute the implemented ParentLinkRequest adoption/exact-reconciliation/metadata-only rollback
   toolkit against a restored production-shaped PostgreSQL backup.
3. [~] PostgreSQL certification now proves concurrent request resolution is serialized before any
   guardian mutation. Replacement still requires explicit confirmation plus the expected current
   guardian. Hosted detach/relink and failure-compensation evidence remains.
4. Complete notification, privacy, accessibility and password-reset onboarding review.
5. PostgreSQL concurrency is now part of required CI. Hosted roles, lifecycle, backup/restore and
   controlled pilot evidence remain.
