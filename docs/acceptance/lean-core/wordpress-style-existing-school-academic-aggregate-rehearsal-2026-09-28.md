# Existing-school Academic aggregate restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope

This gate restores one representative legacy school and adopts every Academic cutover boundary in
the documented dependency order: departments/memberships, Student profiles, enrollment intervals,
classes, canonical subjects, admissions, and Attendance-owned Study Years. Unlike the individual
component drills, it proves that all eight reconciliation journals and both required plugin states
coexist and satisfy the unified read-only cutover checker.

## Safety and execution

`academic-aggregate-restored-backup-certification.js` requires the exact
`EXISTING_SCHOOL_REHEARSAL_ALLOW=academic-aggregate-only` guard, distinct PostgreSQL URLs, a safe
new target database name, and a non-root absolute backup directory. It creates one verified custom
format backup, restores it into an empty target, applies immutable Academic Management and
Attendance Manager migrations, adopts each dataset in bounded chunks, and runs the production
aggregate cutover checker. It never drops or replaces the source database.

The local PostgreSQL 16 run passed with:

```text
ready: true
blockers: 0
departments / memberships: 2 / 2
Study Years / current: 2 / 1
classes: 7
admissions / custom fields / settings: 2 / 1 / present
Student profiles: 4
enrollment intervals: 2
canonical subjects: 3
journals reconciled: 8 / 8
Academic Management: active 0.1.12
Attendance Manager: active 0.1.8
```

Every source/target fingerprint matched. The non-secret machine report is retained in
`wordpress-style-existing-school-academic-aggregate-result-2026-09-28.json`.

## CI enforcement

Required PR validation now provisions PostgreSQL 16, runs the safety contract, executes this full
restored-school rehearsal, and uploads the JSON report. The workflow passes local `actionlint`.

## Remaining acceptance

- Obtain the first remote CI artifact.
- Repeat on an approved anonymized hosted backup.
- Complete hosted lifecycle, cutover/rollback approval, and the controlled school pilot before
  removing any legacy Academic tables or routing compatibility.
