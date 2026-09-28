# Existing-school Transportation restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope and result

This gate migrates the complete legacy Bus boundary: routes, stops, vehicles, and historical GPS
locations. Rider assignments are explicitly recorded as not applicable to legacy migration because
they are a new Transportation-plugin capability and no equivalent legacy table exists. The gate
does not fabricate historical rider records.

The guarded run passed verified backup, isolated restore, immutable plugin migrations, zero-write
dry run, one-row adoption chunks, exact reconciliation, and non-destructive routing rollback.
Each legacy dataset contained representative relational data, while the source and target rider
datasets remained empty. Source and target fingerprints matched exactly:

`843252dfe541190ad9c3d40497224bb89d3357d886ba8a318b0a7cab9c189b81`

Both legacy and plugin data remained intact. The production adapter also now binds legacy temporal
values using native date parameters. The machine result is retained in
`wordpress-style-existing-school-transportation-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now runs this PostgreSQL 16 gate and uploads its result. Remaining work is
the first remote artifact, approved hosted-backup execution, real GPS/device ingestion, browser
map accessibility, hosted lifecycle validation, and pilot approval.
