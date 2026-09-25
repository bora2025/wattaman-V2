# MP-2 master checklist reconciliation

Date: 2026-09-22  
Status: pass for MP2-005 and MP2-008 local contract scope; MP-2 gate remains open

## Purpose

The detailed Academic Management checklist recorded MP2-005 lifecycle/outbox events as complete
and MP2-008 dependent fixtures as implemented, while the lean-core master checklist still showed
both items open. This evidence re-runs the relevant executable checks and reconciles only those two
bounded items. It does not certify hosted migration, recovery, cutover, or pilot operation.

## Commands and results

From `backend/`:

```text
node --test scripts/academic-management-reference-plugin.test.js scripts/mp2-dependent-fixtures.test.js
```

Result: 12 passed, 0 failed. The reference plugin verifies StudyYear/Class/student membership
lifecycle publication. Attendance, Timetable, Examination, Learning and Finance consume the
roster/enrollment fixture contract, including invalid-date rejection.

```text
npm.cmd test -- --runInBand src/class-registrations/academic-lifecycle-subscriber.service.spec.ts
```

Result: one suite and two tests passed. The core subscriber accepts StudyYear, Class and student
membership lifecycle events without reading the plugin schema.

During reconciliation, wall-clock suffixes were found in several durable event idempotency keys.
Version 0.1.1 replaces them with SHA-256 keys derived from stable mutation content. The reference
test repeats an identical Class update and verifies that both attempts produce the same key; no
`Date.now()` idempotency key remains in the Academic Management plugin source.

## Remaining MP-2 work

MP2-001 through MP2-004, MP2-006, MP2-007 and MP2-009 remain incomplete or partially complete.
The MP-2 program gate must remain open until schema ownership, runtime binding, complete adoption,
restored-backup lifecycle, cutover/rollback and controlled pilot evidence exist.
