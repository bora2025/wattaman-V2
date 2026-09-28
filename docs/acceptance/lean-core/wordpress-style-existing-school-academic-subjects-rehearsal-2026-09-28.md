# Existing-school Academic subjects restored-backup rehearsal — 2026-09-28

## Scope

This gate covers deterministic conversion of distinct legacy `Class.subject` strings into canonical
Academic Management subjects. It explicitly verifies trimming and case-insensitive deduplication.

## Safety correction

The previous subject rollback implementation deleted adopted plugin rows. That conflicted with the
reform's rollback-window policy. `academic-subjects-rollback-drill.js` now verifies that every
adopted subject remains present, switches routing metadata back to `legacy`, records the rollback in
the adoption journal, and preserves both legacy and plugin data.

## Executable gate

`backend/scripts/academic-subjects-restored-backup-certification.js` requires an exact destructive
guard, distinct PostgreSQL source and target databases, a safe target name and a non-root backup
directory. It is designed to run a school-bound backup, isolated restore, immutable plugin
migrations, zero-write dry-run, deterministic adoption, exact reconciliation, and non-destructive
rollback. The `existing-school-academic-subjects-rehearsal` CI job runs that gate and retains its
non-secret JSON report.

## Verification completed

```text
npm run test:academic-subjects:rollback-drill: 2 passed, 0 failed
npm run test:existing-school:academic-subjects: 3 passed, 0 failed
node --test tools/existing-school-rehearsal-contract.test.js: 12 passed, 0 failed
npm run test:tools: 88 passed, 0 failed
```

The guarded PostgreSQL 16 rehearsal also passed on 2026-09-28. It created a school-bound backup,
restored it into the distinct `restored_subjects` database, applied immutable Academic Management
migrations, and reconciled three legacy classes into two canonical subjects. Source and target
fingerprints both equalled
`f8f03383b96a5132a0c9cd25b30a3af197176417cb5ec06933b8c5f301a014f1`. The dry run made zero
writes, adoption reconciled, rollback retained all legacy and plugin rows, and the non-secret result
is retained in `wordpress-style-existing-school-academic-subjects-result-2026-09-28.json`.

## Remaining acceptance

- Retain the first hosted green CI run and JSON artifact.
- Complete browser parity and school-owner acceptance on an approved anonymized restored school.
