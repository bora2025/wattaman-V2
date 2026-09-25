# MP-2 local migration toolkit recheck

Date: 2026-09-25  
Status: local harness passed; restored-backup and hosted drills remain open

## Scope

The Academic migration toolkit was re-run as one grouped check for Student Profiles, Classes, and
Admissions. Each domain covers deterministic read-only preflight, backup-bound resumable adoption,
exact fingerprint reconciliation, explicit rollback confirmation, routing rollback, and fail-closed
stale/missing/incomplete journal behavior. The unified readiness gate additionally requires source
and target parity, reconciled journals, a matching backup, an active plugin, and no maintenance lock.

## Results

- Student Profile preflight/adopt/rollback: **9/9 passed**.
- Class preflight/adopt/rollback: **9/9 passed**.
- Admissions preflight/adopt/rollback: **9/9 passed**.
- Unified `academic-management-cutover-readiness.test.js`: **3/3 passed**.
- Combined: **30 passed, 0 failed**.

The first grouped command referenced a nonexistent convenience alias
`test:academic-cutover-readiness`; the authoritative test was then run directly and passed. The
checked-in alias is `test:academic-management:cutover-check`.

## Limit

Docker Desktop was not running (`docker_engine` pipe absent), so this evidence does not prove a
real PostgreSQL restored-backup drill. It also does not prove Railway cutover, rollback, recovery,
or pilot operation. MP2-007 and MP2-009 therefore remain open/partial as recorded in the master
checklist.
