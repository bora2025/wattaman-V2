# MP2 Enrollment Rollback Drill — Local Evidence

Date: 2026-09-25
Status: local non-destructive rollback verified; hosted certification remains open

## Scope

The Academic Management enrollment adoption path now has an explicit, fail-closed rollback drill.
It returns `ACADEMIC_ROSTER_READ_OWNER` to `legacy` without deleting either the legacy current
membership data or the plugin-owned enrollment intervals.

The drill requires all of the following before it changes routing metadata:

- `ACADEMIC_ENROLLMENT_ROLLBACK_DRILL=true`;
- a supported Academic Management plugin slug;
- the current read owner to be either `legacy` or `plugin`;
- a verified backup manifest and matching database dump;
- a completed, reconciled adoption journal;
- an exact match between the journal's backup hash and the verified backup hash; and
- a fresh source/target preflight with no blocker other than the expected non-empty target.

The rollback changes only the registry routing owner. It deliberately preserves both datasets for
comparison, retry and recovery during the approved rollback window.

## Verification

Command:

```text
npm --prefix backend run test:academic-enrollment:adoption
```

Result: 6/6 tests passed. This includes deterministic interval adoption, unattended-confirmation
guards, exact reconciliation, explicit rollback approval, preservation of both datasets and
fail-closed behavior for absent or unreconciled journals.

## Remaining production gate

This evidence does not approve a production owner switch. A restored production-like PostgreSQL
backup must still complete adoption, live parity, rollback and post-rollback legacy-read checks,
with the school/version identifiers and operator approval recorded separately.
