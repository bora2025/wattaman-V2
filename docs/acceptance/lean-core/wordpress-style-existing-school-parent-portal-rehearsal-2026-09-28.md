# Existing-school Parent Portal restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope and result

This guarded gate migrates the legacy parent-link request boundary into Parent Portal's namespaced
storage. Its representative resolved request exercises student-to-directory identity translation,
parent contact metadata, decision state, resolver identity and timestamps.

The run passed verified backup, isolated restore, immutable plugin migration, zero-write dry run,
one-row adoption, exact reconciliation and non-destructive routing rollback. Source and target
fingerprints matched exactly:

`b003ece986c18a2ce0bb89731cdc8f184e03902c5aa3fbeb72d9af8be7a2a88e`

Both legacy and plugin data remained intact. The live run exposed and fixed the production adapter's
timestamp binding: `createdAt` and `resolvedAt` are now sent to PostgreSQL as native date values.
The machine result is retained in
`wordpress-style-existing-school-parent-portal-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now runs this PostgreSQL 16 gate and uploads its non-secret result. Remaining
work is the first remote artifact, approved hosted-backup execution, password-reset onboarding,
browser and accessibility validation, full lifecycle validation, and parent/school pilot approval.
