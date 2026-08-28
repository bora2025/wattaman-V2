# Gate B Legacy Preflight Evidence — 2026-08-28

Scope: B-001 classifier foundation and a managed-database production smoke test. This does not close legacy adoption because two sanitized legacy snapshots, exact schema comparison, adoption, and rollback rehearsals remain.

## Automated state coverage

`node --test scripts/legacy-preflight.test.js` passes five cases:

- empty database permits normal migrations;
- managed database permits normal migrations;
- complete legacy anchors require backup, restore, comparison, then adoption;
- partial/contradictory schema stops with no mutation permission;
- report fingerprint is deterministic and contains no customer rows.

## Railway production-shaped execution

The command ran inside the private API container against the `Wattanam V2 - Core` PostgreSQL service using Railway SSH. It reported:

```text
format: wattanam-legacy-preflight-v1
state: managed
nextAction: migrate_deploy
safeToMutate: true
PostgreSQL: 18.6
tables: 75
columns: 773
migrations: 4
schemaFingerprint: 9d05f932d8b4a8443a50da0658f56170a7349566224942677a96fd52e2f2065f
containsCustomerRows: false
```

Applied migrations were the baseline, installation, plugin registry, and plugin SDK state migrations.

## Deployment defect discovered and corrected

Service-local Railway configurations contained repository-root watch patterns, causing valid CLI service-root uploads to be skipped. Custom watch patterns were removed from API and web; the subsequent API upload built and deployed successfully. Root-directory selection remains a Railway service setting.

## Compatibility finding and backup verification

Railway provisioned PostgreSQL 18 rather than the PostgreSQL 16 Compose baseline. The API image previously contained PostgreSQL client 16, which cannot dump a newer PostgreSQL 18 server. The image now installs client 18.

The production-shaped backup command completed against Railway PostgreSQL 18.6 and wrote a custom archive to the API persistent volume:

```text
file: wattanam-20260828T024323Z.dump
size: 176725 bytes
sha256: e175e03dc284401b325d056302384e4f9fb19939628a36b0310ec334d990d0c2
installation: angkor-school
pg_dump: 18.6
```

The manifest contains no credentials. A clean restore then ran into a disposable Railway PostgreSQL 18.6 service using the isolated `RESTORE_DATABASE_URL` path. Restore verification returned `angkor-school`; the restored target had 75 tables, 773 columns, all four migrations, and the exact source fingerprint `9d05f932d8b4a8443a50da0658f56170a7349566224942677a96fd52e2f2065f`. The temporary variable and database service were removed after verification.
