# Core Update and Recovery

## Normal update

1. An owner reviews the signed stable index, release notes, migration notes, immutable image digests, and advisories.
2. Call `POST /updates/core/:version/prepare` as `SUPER_ADMIN`.
3. Preparation rejects an unknown/incompatible release and lists every incompatible active plugin. It creates a native PostgreSQL backup before maintenance begins and writes a durable operation journal under `UPDATE_STATE_DIR`.
4. Once prepared, maintenance mode rejects ordinary writes with `503` while health, authentication recovery, read requests, and the update-completion route remain available.
5. Deploy the exact API, web, and gateway image digests from the signed release. Run migrations and the readiness, version, login, and critical-workflow health gates.
6. Call `POST /updates/core/operations/:operationId/complete` with `{"outcome":"healthy"}`. This records completion and removes maintenance mode.

Do not run an update from mutable image tags and do not manually edit migration history.

## Failure and recovery

Call the same completion endpoint with `{"outcome":"failed","detail":"..."}`. The journal becomes `recovery_required`; maintenance remains active so normal writes cannot widen the recovery point.

Recover with the backup path and SHA-256 stored in the operation record:

1. Preserve failed-container logs and the operation journal.
2. Redeploy the previous recorded image digests when no incompatible data migration ran.
3. If data changed or health remains bad, restore into a clean PostgreSQL target using [backup-and-restore.md](./backup-and-restore.md), then restore the matching uploads/plugin files/configuration recovery set.
4. Verify database readiness, application version, installation identity, schema fingerprint, login, plugin registry, and critical workflows.
5. Record the recovery result. Remove the maintenance flag only after the restored school is healthy; never mark a failed operation healthy merely to clear maintenance.

The operation and backup records are durable across API restarts. Repository failure does not stop the installed school: it only prevents discovery/preparation of a new update.
