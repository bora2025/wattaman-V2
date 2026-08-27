# Backup and Restore Operations

## Strategy

Wattanam production backups use PostgreSQL's native custom archive format. Browser-based JSON export and database-wiping API restore have been removed because they exposed credential hashes and tokens, consumed unbounded API memory, and made destructive recovery available through an online application endpoint.

Production uses three layers:

1. Railway scheduled volume backups.
2. Railway point-in-time recovery when supported by the selected plan.
3. Portable `pg_dump` custom archives copied to independently controlled storage.

A backup is not verified until it has been restored and tested.

## Requirements

- `pg_dump`, `pg_restore`, and `psql` matching a compatible PostgreSQL major version.
- `DATABASE_URL` for the target database.
- A protected `BACKUP_DIR` with adequate free space.
- `APP_VERSION` so manifests record the source release.

The production API image includes PostgreSQL client tools and the operational scripts.

Authorized administrators can inspect non-secret operational state at `GET /diagnostics`. It reports readiness, installation identity, applied or failed migration names, core version, and the latest local backup manifest. Public `/health` and `/version` responses remain minimal.

## Create a Backup

From the backend or API container:

```bash
npm run backup:create
```

Docker Compose one-shot job:

```bash
docker compose --profile operations run --rm backup
```

The command creates:

```text
wattanam-<UTC timestamp>.dump
wattanam-<UTC timestamp>.manifest.json
```

The archive is written to a `.partial` file and renamed only after `pg_dump` succeeds. The manifest contains:

- Creation timestamp.
- Archive filename and size.
- SHA-256 checksum.
- Installation school slug when available.
- Wattanam application version.
- PostgreSQL dump-tool version.

Database credentials are not stored in the manifest or archive filename.

## Retention

`BACKUP_RETENTION_DAYS` controls cleanup of locally generated Wattanam archives. `0` disables automatic cleanup. Cleanup is restricted to timestamped `wattanam-*.dump` and matching manifest files inside the resolved backup directory.

Local retention is not an offsite backup. Copy archives and manifests to encrypted, access-controlled storage outside the Railway project.

## Restore Drill

Use a temporary empty PostgreSQL service. Do not practice against production.

1. Copy the `.dump` and matching `.manifest.json` into the operations container.
2. Set `DATABASE_URL` to the temporary empty database.
3. Run:

```bash
npm run backup:restore -- \
  --from /data/backups/wattanam-<timestamp>.dump \
  --confirm-target EMPTY \
  --yes-replace
```

4. Run `npm run db:migrate:status`.
5. Start the matching application release.
6. Verify `/health/ready`, installation identity, owner login, and critical module reads.
7. Record the drill date, archive checksum, duration, and outcome.

## Replacing an Installed Database

This is destructive and must be performed during an approved maintenance window.

1. Confirm the correct Railway project and environment.
2. Stop web, API, worker, and integrations that can write.
3. Verify the archive checksum and source school in its manifest.
4. Confirm the target school's slug from installation records.
5. Run:

```bash
npm run backup:restore -- \
  --from /data/backups/wattanam-<timestamp>.dump \
  --confirm-target exact-target-school-slug \
  --yes-replace
```

The restore command:

- Verifies the matching manifest and SHA-256 checksum.
- Validates the archive with `pg_restore --list`.
- Refuses a mismatched target confirmation.
- Creates a new pre-restore backup for a non-empty installation.
- Restores inside one PostgreSQL transaction with exit-on-error.
- Verifies the restored installation identity.

After success, run migration status, start services, verify health, test login, and validate critical workflows. Preserve the pre-restore archive until recovery is formally accepted.

## Failure Rules

- Never bypass a checksum mismatch.
- Never restore while application writes continue.
- Never use `--confirm-target EMPTY` against an installed school.
- Never delete the pre-restore backup during incident response.
- Never consider a volume snapshot sufficient for provider migration; retain portable dumps.
- If identity verification fails after restore, keep services stopped and investigate before allowing users to connect.

## Railway Scheduling

Use a Railway cron or an external scheduler to run the backup image with the same database reference and a persistent backup volume. Copy completed archives offsite; deleting a Railway project or volume can also remove project-local recovery material.
