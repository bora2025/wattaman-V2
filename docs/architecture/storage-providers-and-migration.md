# Storage Providers and Reversible Migration

## Contract

`ObjectStorageProvider` defines `get`, `put`, `delete`, `list`, and `checksum`. Every key is relative, slash-normalized, and traversal-checked. Writes return a SHA-256 identity.

Implemented providers:

- `LocalVolumeStorageProvider`: atomic temporary-file plus rename, restrictive modes, no symlinks or root target.
- `S3StorageProvider`: S3-compatible endpoint, private bucket, SHA-256 object metadata, pagination, optional path-style addressing.
- `DualWriteStorageProvider`: writes/deletes both stores, verifies matching checksums, reads primary then fallback, and unions listings.

The first migrated production consumer is plugin-owned data. Its key remains `<pluginId>/<relativeName>` and the local root remains exactly `PLUGIN_DATA_DIR`, preserving existing installations and recovery archives.

## Modes

| `PLUGIN_STORAGE_PROVIDER` | Read priority | Writes | Purpose |
|---|---|---|---|
| `local` | local | local | Default/small school |
| `dual-local-primary` | local then S3 | both | Populate/verify S3 before cutover |
| `dual-s3-primary` | S3 then local | both | Post-cutover rollback window |
| `s3` | S3 | S3 | Final state after rollback window |

Production S3 endpoints must use HTTPS. Endpoint, bucket, region, access key, and secret key must be complete before startup. Credentials never appear in migration journals.

## Local to S3

1. Configure all `PLUGIN_STORAGE_S3_*` variables but keep `PLUGIN_STORAGE_PROVIDER=local`.
2. Dry-run: `npm run storage:migrate -- --direction local-to-s3 --installation <slug>`.
3. Execute with exact confirmation: `npm run storage:migrate -- --direction local-to-s3 --installation <slug> --execute --confirm-installation <slug>`.
4. Retain the checksum journal outside the installation.
5. Set `dual-local-primary`; exercise plugin reads/writes and take a recovery set.
6. Set `dual-s3-primary`; repeat integrity and access-control checks.
7. After the approved rollback window, set `s3`. Do not delete the local source until a later separately approved retention operation.

## Rollback

Set `dual-local-primary`, run `s3-to-local` with exact confirmation, verify the journal, then set `local`. Migration is resumable: already matching objects are recorded as `matched`; no source object is deleted.

## Backup and restore

Recovery-set scripts support `local` and both dual modes because a complete local mirror exists. They fail before touching data in S3-only mode. For S3-only backup, migrate `s3-to-local` and use `dual-s3-primary` during archive creation. For restore, restore into `dual-local-primary`, migrate local-to-S3, then cut over. This prevents a successful-looking recovery set that silently omits remote objects.

## Remaining adoption order

Plugin installation packages and update/maintenance journals still require filesystem atomic-rename semantics and remain on the volume. They should move only after their lifecycle transactions have an object-store-safe staging/commit protocol. Database backups remain native PostgreSQL archives and are not application object storage.
