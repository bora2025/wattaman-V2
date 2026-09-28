# Existing-school Examination restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope

This gate restores one representative legacy school and migrates the complete Examination
boundary: score sheets, linked classes, subjects, reporting tabs, score entries, exams, questions,
and attempts. The retained report contains aggregate counts and hashes only; question content,
answer keys, student answers, feedback, and identities are not emitted.

## Result and safety

The command requires `EXISTING_SCHOOL_REHEARSAL_ALLOW=examination-only`, distinct PostgreSQL URLs,
a safe new target database name, and a non-root backup directory. It passed verified backup,
isolated restore, immutable plugin migrations, zero-write dry run, one-row adoption chunks, exact
canonical reconciliation, and non-destructive routing rollback on PostgreSQL 16.

All eight datasets contained representative related data. Source and target fingerprints matched
exactly (`c8383c457e11d029fe6dd8326df86b30805aa8dbcce0986518d3df42d8609f99`), and both legacy and
plugin data remained intact. The run also validates explicit timestamp typing throughout the
production Examination adoption adapter.

The non-secret result is retained in
`wordpress-style-existing-school-examination-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now runs this PostgreSQL 16 gate and uploads its report. Remaining work is
the first remote artifact, an approved anonymized hosted backup, rich-question and browser-report
parity, hosted lifecycle validation, accessibility/security review, and pilot approval.
