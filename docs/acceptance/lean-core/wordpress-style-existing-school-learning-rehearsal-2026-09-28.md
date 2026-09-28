# Existing-school Learning restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope

This gate migrates all thirteen Learning datasets from one restored legacy school: assignments,
submissions, quiz questions and answers, courses, lessons, lesson pages, enrollments, lesson
attempts, page responses, course sessions and attendance, and lesson engagement views. Evidence
contains only counts and hashes, never learning content, answer keys, responses, or identities.

## Result

The guarded run passed verified backup, isolated restore, checksum-pinned plugin migrations,
explicit approval of destructive migration `014_allow_assignment_attempts`, zero-write dry run,
one-row adoption chunks, exact canonical reconciliation, and non-destructive routing rollback.
Each dataset contained one representative related row. Source and target SHA-256 matched exactly:

`87115bc0017dbbafd533a217ad1eaa683ee6c276cbd27098ba7f7a4f27da9f51`

Both legacy and plugin data remained intact. The rehearsal also found and fixed two production
adapter defects: legacy lesson attempts now resolve Student directory identities with an explicit
bounded lookup instead of an invalid Prisma relation, and JSON typing is dataset-specific so
submission text is not JSON-quoted while page/question payloads remain JSONB.

The machine result is retained in
`wordpress-style-existing-school-learning-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now runs this PostgreSQL 16 gate and uploads its non-secret result.
Remaining work is the first remote CI artifact, approved hosted-backup execution, browser and
accessibility parity, notification delivery, hosted lifecycle validation, and pilot approval.
