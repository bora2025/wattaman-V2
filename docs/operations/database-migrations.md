# Database Migration Operations

## Scope

Wattanam uses checked-in Prisma migrations for every production schema change. Production deployments run `prisma migrate deploy`; they must never run `prisma db push`.

The first migration is:

```text
20260827000000_baseline
```

It represents all 68 models in the schema at the time migration history was introduced.

## Non-Negotiable Rules

1. Never edit a migration after it has been released.
2. Never run the baseline SQL against a populated Wattanam database.
3. Back up the database before adopting migration history or deploying a schema change.
4. Test restoration, not only backup creation.
5. Stop deployment when migration execution fails.
6. Do not use `prisma migrate dev` against production.
7. Do not mark a migration applied until the target schema has been compared with the expected schema.

## Fresh Installation

A fresh installation starts with an empty PostgreSQL database. Run:

```bash
cd backend
npm ci
npm run db:migrate:deploy
```

Prisma creates its migration history table and applies the baseline. Application startup performs the same deploy command before starting the API.

Verify:

```bash
npm run db:migrate:status
```

The result must report that the database schema is up to date.

## Existing Installation Adoption

An existing installation may already contain the baseline tables because older Wattanam releases used `prisma db push`. It must adopt the migration history without executing the baseline SQL.

### 1. Record the Current Deployment

Record:

- Railway project and environment.
- Current application commit.
- PostgreSQL version.
- Current `DATABASE_URL` secret location.
- Database size.
- Backup identifier and timestamp.

### 2. Create and Verify a Backup

Create both a Railway volume backup and a logical dump when possible. Restore the logical dump into a temporary PostgreSQL instance and verify that the application can read it.

Do not continue if the restore drill fails.

### 3. Compare the Existing Schema

Use a temporary copy of the database, not the only production database:

```bash
npx prisma migrate diff \
  --from-url "$TEMPORARY_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

Expected result: no schema difference. If differences exist, review and reconcile them before marking the baseline applied.

### 4. Mark the Baseline Applied

Only after the comparison succeeds, point `DATABASE_URL` at the intended database and run:

```bash
npm run db:baseline:existing
```

This records `20260827000000_baseline` as applied without executing its SQL.

### 5. Verify Migration State

```bash
npm run db:migrate:status
```

Then deploy the application and verify:

```text
GET /health
GET /health/ready
GET /version
```

Test login and at least one read operation from every critical existing module.

## Creating a New Migration

During development, update `schema.prisma`, then run against a development database:

```bash
npx prisma migrate dev --name descriptive_change_name --schema=prisma/schema.prisma
```

Review generated SQL for:

- Table or column drops.
- Required columns added to populated tables.
- Unique constraints that existing data could violate.
- Long table locks.
- Data conversions.
- Index creation cost.

Commit the schema and migration together. Run tests against both a fresh database and an upgraded production-like database.

## Failed Migration Response

If a deployment migration fails:

1. Keep the API stopped.
2. Preserve logs and the exact migration name.
3. Do not repeatedly redeploy.
4. Inspect Prisma migration status.
5. Restore into a temporary database for diagnosis.
6. Prefer a reviewed forward-fix migration.
7. Restore the verified pre-deployment backup if safe recovery cannot be proven.

Never use `migrate resolve` merely to hide a failed migration. It changes migration bookkeeping and must reflect the real database state.

## Production Seeding

Production startup does not run a seed script. The historical production seed contained a fixed administrator identity and password and has been removed. The remaining development seed refuses to execute when `NODE_ENV=production`.

The first administrator is created by the first-run installation workflow using customer-provided credentials. Existing databases must not use the fresh installer; they remain locked as `legacy_unadopted` until the offline adoption work package in the master execution plan is implemented and verified.
