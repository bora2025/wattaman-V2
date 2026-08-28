# Wattanam V2 Implementation Baseline

> Delivery status ledger for the [Platform Master Execution Plan](./platform-master-execution-plan.md). Architecture targets remain in the A-to-Z plan; this file records implementation evidence only.

## Purpose

This document tracks validation of the A-to-Z architecture plan against the existing codebase. It distinguishes confirmed work, corrected assumptions, risks, and implementation gates.

Status values are `not started`, `in progress`, `verified`, or `blocked`.

## Current-System Findings

| Area | Finding | Impact | Required action |
|---|---|---|---|
| Architecture | Backend is a NestJS modular monolith | Suitable starting point | Introduce stable contracts before extracting plugins |
| Web | Frontend is Next.js 14 | Suitable starting point | Keep current framework during platform work |
| Mobile | Mobile app uses Expo | Independent client can remain | Version the API before third-party integration |
| Database | Prisma uses PostgreSQL | Matches target architecture | Establish checked-in versioned migrations |
| Production schema | Containers previously ran `prisma db push` | Unsafe foundation for upgrades and plugins | Baseline generated and startup changed to `prisma migrate deploy`; PostgreSQL tests remain |
| Production seed | Backend startup created a fixed default administrator | Critical credential risk | Automatic production seeding removed; setup workflow will create the owner |
| Authentication | A known JWT fallback secret was accepted | Critical production risk | Fail startup when production secret is missing or weak |
| CORS | Railway and Vercel wildcard suffixes were trusted | Origin scope was broader than installation configuration | Require exact configured origins in production |
| Health | Existing endpoint reported process metadata only | Could report healthy while database was unavailable | Separate liveness, readiness, and version endpoints |
| Configuration | Runtime inputs historically had distributed parsing | Required core, bounded backup/plugin/auth settings, and optional notification adapters validate centrally before startup | Complete production custody and rotation records under A-008 |
| Testing | No backend unit test files existed | Refactoring risk is high | Add tests with each platform foundation change |
| Dependencies | Production dependency audit now reports 12 moderate findings and no high/critical findings; development tooling still reports 10 high findings requiring major toolchain upgrades | Production high-risk upload findings were removed without a forced framework migration | Plan and test Nest/toolchain major upgrades; do not expose development tooling in release images |
| Packaging | Backend and frontend Dockerfiles exist | Useful baseline | Consolidate into supported Compose deployment later |
| Plugin system | No runtime or SDK exists | Marketplace cannot safely begin | Complete core contracts and migration foundation first |

## Railway Core Reference Deployment

Verified on 2026-08-28 in Railway project `Wattanam V2 - Core`:

| Resource | State | Verification |
|---|---|---|
| PostgreSQL | verified | Private service online with persistent database volume |
| API | verified | Private service healthy; PostgreSQL readiness passes; persistent `/data` volume attached |
| Web | verified | Private service healthy and setup UI served through the gateway |
| Gateway | verified | Only public service; `/gateway-health` returns HTTP 200 |
| Private routing | verified | Gateway reaches `api.railway.internal:3001` and `web.railway.internal:3000` |
| Exact-origin CORS | verified | API configured for the generated gateway HTTPS origin |
| Public smoke test | verified | Health, readiness, version, installation status, and `/setup` return HTTP 200 |
| First-run claim | verified manual journey | Reference installation reports `installed` for `Angkor School`; automated browser submission remains INS-004 |

This proves the reference topology and smoke path, not the remaining Gate B automation, custom-domain lifecycle, complete recovery-set drill, or browser setup submission journey.

## Corrections to the Architecture Plan

1. **Versioned migrations are a prerequisite, not a plugin-runtime detail.** The current database has no checked-in Prisma migration history. A baseline migration and upgrade policy must be established before plugin migrations are designed.
2. **The first implementation phase must preserve the current directory structure.** Moving to the target workspace layout immediately would combine architectural refactoring with operational hardening and make regressions harder to isolate.
3. **The first plugin remains announcements, but extraction is deferred.** It begins only after configuration, migrations, health checks, backups, public contracts, and safe-mode behavior exist.
4. **Marketplace implementation is gated by signed local packages.** Purchasing and publisher workflows provide no safe value until local package verification and lifecycle management have been proven.
5. **Self-hosting support begins with one documented Docker profile.** Additional cloud templates are added only after clean install, update, backup, and restore tests pass.

## Implementation Traceability

| ID | Capability | Status | Verification |
|---|---|---|---|
| FND-001 | Validate required runtime configuration | verified | Core, authentication expiry, cookie, backup/plugin settings, and atomic optional notification adapters have startup validation and secret-free status projection; 20 suites/69 tests and build pass |
| FND-002 | Reject insecure production JWT secrets | verified | Production configuration unit test |
| FND-003 | Require exact production CORS origins | verified | Origin parser and production configuration unit tests |
| FND-004 | Provide liveness endpoint | verified | Health service test and successful backend build |
| FND-005 | Provide database readiness endpoint | verified | Unit tests pass and the release Compose stack reported PostgreSQL `up` through `/health/ready` |
| FND-006 | Provide stable version endpoint | verified | Build metadata test and successful backend build |
| OBS-001 | Provide administrator operational diagnostics | verified | Authenticated owner received installation, migration, database, version, and backup state from the release container |
| SEC-001 | Triage and remediate dependency vulnerabilities | in progress | Multer pinned to patched 2.2.0; production audit has 0 high/critical and full backend suite passes; 12 production moderate and development-tool findings require controlled major upgrades |
| DB-001 | Inventory Prisma schema ownership | in progress | Technical inventory assigns all current core and marketplace models, systems, persistent files, configuration classes, providers, and contract surfaces; field-level sensitivity, retention, export, deletion, and plugin-access classification remains Phase A |
| DB-002 | Create migration baseline safely | in progress | Four migrations applied to fresh PostgreSQL 16 and survived restore; read-only classifier covers empty/managed/legacy/partial states; baseline-only PostgreSQL 18 fixture adopted with fingerprint/backup/journal/audit and exact post-migration fingerprint; two sanitized real legacy snapshots remain |
| DB-004 | Guarded resumable legacy adoption | in progress | Command verifies explicit guard, exact slug, approved fingerprint, existing SUPER_ADMIN, recovery backup/manifest/checksum, journal binding and path safety; synthetic Railway drill preserved owner, created one installation/audit, applied four migrations, and resumed idempotently; real legacy evidence remains |
| DB-003 | Replace production `db push` | verified | Release container applied four checked-in migrations with `prisma migrate deploy` |
| SEC-002 | Remove fixed production administrator seed | verified | Startup commands no longer invoke `seed-prod.js` |
| INS-001 | Persist installation identity and lock | verified | Fresh PostgreSQL contains one durable singleton installation after container replacement |
| INS-002 | Expose safe installation status | verified | Ready, installed, and legacy-lock unit tests pass |
| INS-003 | Create first owner transactionally | verified | Simultaneous setup requests produced exactly one installation and one `SUPER_ADMIN`; subsequent setup returns HTTP 409 |
| INS-004 | Build browser setup wizard | in progress | Production build passes; browser-to-PostgreSQL end-to-end test remains |
| INS-005 | Provide guarded unattended fresh installation | verified | CLI shares DTO/service transaction, requires non-interactive and exact-slug guards, supports sealed password files and optional checked-in migration deploy; Railway PostgreSQL 18 drill installed once and rejected the repeat without exposing owner credentials |
| SEC-003 | Authenticate Socket.IO connections and restrict origins | verified | Socket authentication tests and backend build pass |
| OPS-001 | Define supported Docker environment | in progress | PostgreSQL 16 and current release containers are validated; exact Node/Linux/Docker/browser versions and support windows require Gate A approval |
| OPS-002 | Create Docker Compose deployment | verified | Isolated release stack built and started PostgreSQL/API/web/gateway healthy on a clean named volume set |
| OPS-003 | Implement backup and restore | verified | PostgreSQL 16 custom archive/restore reproduced identity, owner, and four migrations; Railway PostgreSQL 18 backup restored into a disposable clean service with matching `angkor-school` identity, 75 tables/773 columns, four migrations, and exact source schema fingerprint |
| OPS-004 | Remove destructive online JSON restore | verified | Only authenticated status endpoint remains; frontend contains no restore upload |
| PLG-001 | Define plugin manifest schema | verified | Manifest tests and announcements example pass |
| PLG-002 | Define plugin SDK contracts | in progress | SDK 1.0 events, authenticated routes, persisted jobs, scoped settings/storage, permissions/navigation, declarative pages, health, and cleanup have contract tests; audit/notification adapters and granular permission evaluation remain |
| PLG-003 | Implement signed package verification | verified | Valid, tampered, extra-file, signature, path, and compatibility tests pass |
| PLG-004 | Extract announcements reference plugin | in progress | Complete SDK reference now proves routes/settings/storage/job/migration/permissions/navigation/declarative UI/events/health; legacy announcement business-data cutover remains pending PostgreSQL validation |
| PLG-005 | Persist lifecycle registry and versioned files | verified | Signed package installed and reloaded from PostgreSQL/volumes; removal preserved migration, setting, job, and namespaced table state before repository reinstall |
| PLG-006 | Provide plugin safe mode | verified | `PLUGIN_SAFE_MODE` skips startup loads and rejects activation while authenticated core plugin administration remains available; runtime tests/build pass |
| PLG-007 | Require inspection and exact-package confirmation | verified | Admin flow previews publisher, compatibility, dependencies, capabilities, permissions, and migration risk; install requires matching SHA-256 |
| PLG-008 | Execute recoverable plugin migrations | in progress | Backup-before-migration and transactionally coupled SQL/history/registry implemented with namespace/immutability tests; PostgreSQL rollback/restore integration remains |
| MKT-001 | Official release repository | verified | Separate PostgreSQL service migrated, registered a verified publisher, persisted an immutable artifact across restart, signed its index, and supplied a checksum-verified package to a school API |
| MKT-002 | Marketplace commerce foundations | in progress | Separate account/order/payment/idempotent-webhook/installation/entitlement records exist; product licensing decisions, offline token issuance, and payment integration remain |

Phase A records: [technical ownership inventory](./architecture/technical-inventory.md), [support matrix](./architecture/support-matrix.md), and [ADR index](./architecture/adr/README.md).

### Open-item execution mapping

| Baseline item | Master-plan work packages |
|---|---|
| SEC-001 | A-009 and cross-cutting Security/CI gates |
| DB-001 | A-002, A-007 and Data Privacy/Lifecycle |
| DB-002 | B-001–003 |
| INS-004 | B-004 |
| OPS-001 | A-005, B-005 and B-013 |
| PLG-002 | C-003, C-006 and C-008 |
| PLG-004 | C-004–005 |
| PLG-008 | C-001–002 |
| MKT-002 | E-001–010 and F-001–008 |

The [master execution plan](./platform-master-execution-plan.md) owns scope, dependencies, estimates, and acceptance gates for these items. This baseline changes status only when the named evidence exists.

## Step-by-Step Execution Gates

### Gate 1: Secure Runtime Foundation

- Configuration validates before NestJS starts.
- Production rejects missing or insecure secrets.
- Production permits only explicit CORS origins.
- Liveness, readiness, and version behavior are tested.
- Backend build and tests pass.

### Gate 2: Database Upgrade Foundation

- Existing production deployments and schema state are inventoried.
- A reviewed Prisma migration baseline exists.
- A copy of production-like data upgrades successfully.
- Containers use `prisma migrate deploy`.
- Recovery is documented and tested.

### Gate 3: Installable Product

- Docker Compose starts all required services.
- Setup is repeatable on a clean host.
- Database and uploads persist across container replacement.
- Backup and restore complete successfully.
- Supported runtime versions are documented.

### Gate 4: Plugin-Capable Core

- Public core contracts and event rules are versioned.
- Plugin packages are validated and signed.
- Lifecycle and migrations are transactional or recoverable.
- Safe mode remains accessible after plugin failure.
- Announcements works as the reference plugin.

### Gate 5: Distribution and Commerce

- Compatible updates are discovered and verified.
- Entitlements work without continuous marketplace access.
- Official paid-plugin workflow is audited.
- Third-party publishing remains closed until governance and security review are operational.

## Rule for Updating This Document

A status becomes `verified` only after its stated verification has passed against the actual release artifact or runtime. Code completion alone is not sufficient.
