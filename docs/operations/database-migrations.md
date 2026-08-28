# Database Migration Operations

## Scope

Wattanam uses checked-in Prisma migrations for every production schema change. Production deployments run `prisma migrate deploy`; they must never run `prisma db push`.

The first migration is:

```text
20260827000000_baseline
```

It represents the core models in the schema at the time migration history was introduced. The current ownership inventory, rather than this historical count, is authoritative as later migrations add platform models.

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

Run the read-only classifier before choosing a migration path:

```bash
cd backend
npm run db:legacy:preflight > legacy-preflight.json
```

The report contains PostgreSQL/schema metadata and a deterministic schema fingerprint, but no customer rows. Interpret `state` as follows:

| State | Meaning | Permitted next action |
|---|---|---|
| `empty` | No public tables | Normal `migrate deploy` |
| `managed` | Baseline migration has completed | Normal `migrate deploy` |
| `legacy_unadopted` | Legacy anchor tables exist without Prisma history | Backup, restore drill, exact schema diff, then adoption |
| `unsupported_partial` | Partial or contradictory schema | Stop for engineering review; exit code 2 |

`safeToMutate: false` is mandatory for legacy and unsupported states. The preflight never marks a legacy schema adopted.

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

Only after the comparison succeeds, use the guarded adoption command rather than calling `migrate resolve` directly. Record the approved preflight fingerprint and identify an existing `SUPER_ADMIN`:

```bash
ADOPT_NON_INTERACTIVE=true \
ADOPT_SCHOOL_NAME='Existing School' \
ADOPT_SCHOOL_SLUG='existing-school' \
ADOPT_CONFIRM_SLUG='existing-school' \
ADOPT_OWNER_EMAIL='existing-owner@school.example' \
ADOPT_APPROVED_SCHEMA_FINGERPRINT='<64-character preflight fingerprint>' \
ADOPT_LOCALE='en-KH' \
ADOPT_TIMEZONE='Asia/Phnom_Penh' \
ADOPT_CURRENCY='KHR' \
npm run db:legacy:adopt
```

The command refuses a fingerprint mismatch, missing owner, partial schema, or already initialized installation. Before mutation it creates a native backup plus a `legacy-adoption-<slug>.json` recovery journal. It records `20260827000000_baseline` without executing its SQL, deploys later migrations, creates installation identity and site settings transactionally, and appends a `LEGACY_ADOPTION` audit record.

If the process stops after creating its journal, inspect the backup, journal, database state, and logs. Rerun the same inputs with `--resume`; the journal binds the school slug, approved source fingerprint, backup filename, and checksum. Never delete or edit the journal to bypass a refusal.

For a disposable certification database referenced from a live operations container, set `ADOPT_DATABASE_URL` and add `--use-adopt-database-url`. Never point that variable at another customer installation.

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
