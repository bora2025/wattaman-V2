# Existing-school Communication restored-backup rehearsal — 2026-09-28

Status: **local PostgreSQL 16 certification passed; hosted execution pending**

## Scope and result

This guarded gate migrates the complete legacy Communication boundary: private messages and public
posts. Representative data exercises sender/receiver directory identities, message timestamps,
publication state, media type and JSON tags. The delivery outbox is plugin-only state and correctly
starts empty rather than fabricating historical delivery events.

The run passed verified backup, isolated restore, immutable plugin migrations, zero-write dry run,
one-row adoption chunks, exact reconciliation and non-destructive routing rollback. Source and
target fingerprints matched exactly:

`487314af40ccf12cdf0b57722a9899acc788c9822b5043a70589b0a4718f409e`

Both legacy and plugin data remained intact. The production adapter now binds timestamps as native
date values and tags as explicitly cast JSONB. The machine result is retained in
`wordpress-style-existing-school-communication-result-2026-09-28.json`.

## CI and remaining acceptance

Required PR validation now runs this PostgreSQL 16 gate and uploads its non-secret result. Remaining
work is the first remote artifact, approved hosted-backup execution, outage and WebSocket reconnect
testing, browser/mobile accessibility and lifecycle validation, and school pilot approval.
