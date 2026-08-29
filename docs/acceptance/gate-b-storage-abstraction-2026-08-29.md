# Gate B — Storage Abstraction — 2026-08-29

## Implemented

- Local-volume, S3-compatible, and dual-write providers share a checksum-aware contract.
- Plugin-owned storage is migrated without changing its SDK or local directory layout.
- S3 configuration fails closed and requires HTTPS in production.
- Dual-write detects checksum divergence and supports primary/fallback reads.
- Guarded bidirectional migration copies, verifies, resumes idempotently, journals without credentials, and never deletes its source.
- Recovery-set scripts reject S3-only mode rather than silently omitting remote data and document the dual-mode backup/restore sequence.

## Verification

- Storage/provider/migration/plugin boundary: 3 suites, 8 tests pass.
- Complete backend: 42 suites, 220 tests pass.
- Production build: 200 files compiled.
- Production dependency audit: zero high/critical; two pre-existing moderate findings remain in the ExcelJS/UUID chain.

## Live drill (2026-08-29)

`backend/scripts/storage-s3-cutover-live-drill.js` closes the item named above as open, running
every named scenario against a real S3-compatible service (MinIO via Docker), using the real,
unmodified `createPluginStorageProvider`/`copyAndVerifyStorage`/`S3StorageProvider`/
`LocalVolumeStorageProvider` production functions, not reimplemented logic. 23/23 checks pass:

- **local → dual → S3**: objects seeded under a local-only provider are (correctly) absent from
  S3 until backfilled; switching to `dual-local-primary` makes *new* writes land in both local
  and S3 immediately; `copyAndVerifyStorage` then backfills the pre-existing objects, checksum-
  verifying every one against the source.
- **Post-cutover write/read**: after switching fully to `PLUGIN_STORAGE_PROVIDER=s3`, a fresh
  write lands and reads back correctly, and the local directory is confirmed untouched by the
  cutover (the source is retained, exactly as designed).
- **Recovery-set S3-only rejection**: `backup-recovery-set.js` run with
  `PLUGIN_STORAGE_PROVIDER=s3` exits non-zero and names its own real remediation
  (`storage:migrate` + `dual-s3-primary`) rather than a generic error or, worse, silently
  producing a recovery set missing the remote files.
- **S3 → local rollback + checksum comparison**: `copyAndVerifyStorage` run in reverse copies
  every object (both the backfilled and the post-cutover one) from S3 into a *fresh* local
  target; every restored file is confirmed byte-identical via its checksum, and the S3 source is
  confirmed untouched (rollback never deletes).
- **Negative control**: a target that reports a corrupted checksum after a write makes
  `copyAndVerifyStorage` throw `Checksum verification failed`, rather than silently accepting
  bad data as migrated.
- **Denied cross-prefix access**: two installations sharing one physical bucket, isolated only
  by `PLUGIN_STORAGE_S3_PREFIX`, cannot see or read each other's objects — neither `get()` nor
  `list()` crosses the prefix boundary in either direction.

## Remaining

Installed plugin packages and update journals intentionally remain volume-backed until their atomic lifecycle protocol is adapted.
