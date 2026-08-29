# Wattanam V2 Implementation Baseline

> Delivery status ledger for the [Platform Master Execution Plan](./platform-master-execution-plan.md). Architecture targets remain in the A-to-Z plan; this file records implementation evidence only. For a work-package-by-work-package view of what remains, see the [completion checklist](./completion-checklist.md).

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
| SEC-001 | Triage and remediate dependency vulnerabilities | verified | `backend`: NestJS 10→11.2.3 (targeted 11, not the npm-suggested 12, because `@nestjs/throttler@6.5.0` — guarding `/auth/login`, the public class-registration intake, and `/installation/install` — only declares peer support up to `^11.0.0`, and 11.2.3 already clears the actual CVE range `@nestjs/core <=11.1.17`), pulling in Express 5. Three path-to-regexp v8 breaking changes found and fixed, live-tested against a real running server: a bare-wildcard plugin-dispatch route and a `forRoutes('*')` maintenance-mode middleware registration both needed named-wildcard syntax; `@types/express` bumped to v5. Production audit: 12 moderate → 2 (remainder is an unrelated `exceljs`/`uuid` chain needing its own separate breaking downgrade decision, explicitly out of scope). `frontend`: Next.js 14→16.3.3, React 18→19.2.8 — a targeted code audit found zero required application-code changes (no React-19-breaking patterns anywhere, async request-API usage already in place); the one real risk, a custom webpack config that Turbopack-by-default would otherwise hard-fail the build on, handled via an explicit `--webpack` flag. Audit: 5 high → 0. Full verification: build/typecheck/all 39 backend suites (202 tests) pass, live e2e on disposable PostgreSQL 16 (105 checks across both e2e spec files, run independently after confirming a combined-run failure was the rate limiter correctly doing its job, not a regression), and a live frontend build + dev-server smoke test (real rendering, the CSP/X-Frame-Options carve-out for the LaTeX editor intact). Rollback tag `pre-a009-upgrade` set beforehand. One known non-blocking gap left undone on purpose: `next lint` is removed in Next 16 and nothing in this repo's CI invokes it, so it's documented rather than fixed — an ESLint 9 flat-config migration is separate follow-up work |
| DB-001 | Inventory Prisma schema ownership | verified | [technical-inventory.md](./architecture/technical-inventory.md) assigns all 113 Prisma models across both schemas (verified with zero unowned by diffing every `model` declaration against the ownership tables), every persistent file class, configuration class, provider, and contract surface. [data-classification.md](./architecture/data-classification.md) adds the field-level sensitivity layer: a 5-tier scheme (Public/Internal/Personal/Sensitive-Personal/Secret), per-model field tables across every domain bucket in both schemas, third-party exposure flags, and 3 confirmed plaintext-at-rest findings (`RefreshToken.token`, `ClassRegistration.generatedPassword`, `MarketplaceAccount.mfaSecret`). [module-boundaries.md](./architecture/module-boundaries.md) classifies plugin-vs-core access boundaries for all 37 `backend/src/*` modules. Retention/export/deletion *rules* are correctly out of scope for this item — that's A-006's job once DEC-005/006 are accepted |
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
| SEC-004 | Inventory secret generation/custody/rotation/expiry/revocation/redaction | in progress | [secrets-inventory.md](./operations/secrets-inventory.md) covers every secret-shaped environment variable and database column across both backends (`JWT_SECRET`, `DATABASE_URL` ×2, `RefreshToken.token`, plugin signing keys, `SENDGRID_API_KEY`, `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`, `MARKETPLACE_ADMIN_TOKEN`, the repository/entitlement signing keys, `PAYMENT_WEBHOOK_SECRET`), and distinguishes true secrets from public/integrity-sensitive material (`PLUGIN_TRUSTED_KEYS`, `PublisherKey.publicKeyPem`) that was previously listed without that distinction. Two real gaps remain rather than documentation gaps: only the repository signing key has a live-drilled rotation procedure, every other secret rotates by "change the env var and hope nothing breaks" with no overlap window; and redaction claims are code-review-verified, not backed by an automated log-safety test |
| OPS-001 | Define supported Docker environment | in progress | PostgreSQL 16 and current release containers are validated; exact Node/Linux/Docker/browser versions and support windows require Gate A approval |
| OPS-002 | Create Docker Compose deployment | verified | Isolated release stack built and started PostgreSQL/API/web/gateway healthy on a clean named volume set |
| OPS-003 | Implement backup and restore | verified | PostgreSQL 16 custom archive/restore reproduced identity, owner, and four migrations; Railway PostgreSQL 18 backup restored into a disposable clean service with matching `angkor-school` identity, 75 tables/773 columns, four migrations, and exact source schema fingerprint |
| OPS-004 | Remove destructive online JSON restore | verified | Only authenticated status endpoint remains; frontend contains no restore upload |
| PLG-001 | Define plugin manifest schema | verified | Manifest tests and announcements example pass |
| PLG-002 | Define plugin SDK contracts | verified | SDK 1.0 is frozen: twelve capabilities (`api.routes`, `database.read/write`, `directory.read`, `events.publish/subscribe`, `jobs.schedule`, `navigation.register`, `notifications.send`, `permissions.register`, `realtime.notify`, `settings.read/write`, `storage.read/write`, `ui.pages`), the manifest schema, and the migration/permission/lifecycle rules are documented as the stable 1.0 contract in [package-and-runtime.md](./plugins/package-and-runtime.md), with an explicit additive-vs-breaking compatibility policy (a 2.0 bump required for anything breaking; the commercial support-window length is left open pending DEC-011) and a changelog. `plugin-sdk-contract.spec.ts` pins the exact capability list and version constants in CI so a future change is deliberate, not accidental (see [gate-c-sdk-1.0-freeze-2026-08-28.md](./acceptance/gate-c-sdk-1.0-freeze-2026-08-28.md)). Dispatch enforces per-route granular permission evaluation against explicit role grants (SUPER_ADMIN implicit; other roles via `PluginPermissionGrant`, including TEACHER/STUDENT/PARENT) and every attempt is audit-logged; `GET /plugin-api/my-extensions` gives any role a filtered discovery view; every notification send is quota-checked (atomic, race-safe under real concurrency) and audited. The public developer-tooling package now exists too (C-008): `@wattanam/plugin-sdk` and `@wattanam/plugin-cli` (`wattanam-plugin` — init/check/keygen/pack/publish), which generated, checked, signed, installed (real signature verification), and submitted (real marketplace-api) a brand-new reference plugin end to end ([gate-c-plugin-developer-tooling-2026-08-28.md](./acceptance/gate-c-plugin-developer-tooling-2026-08-28.md)). Full backend suite (39 suites/199 tests) plus the two new packages' own suites (12 and 10 tests) pass |
| PLG-003 | Implement signed package verification | verified | Valid, tampered, extra-file, signature, path, and compatibility tests pass |
| PLG-004 | Extract announcements reference plugin | verified | `plugins/announcements/` now owns the full business feature — two new namespaced migrations, all six routes (list/feed/unread-count/read/create/remove), the teacher-forced-CLASS rule, and multi-channel fan-out (IN_APP via the shared core Notification inbox, EMAIL/SMS, realtime push) — not just the SDK-capability demo it was before. Core's `AnnouncementsController` is now a ~40-line Prisma-free proxy into plugin dispatch (`AnnouncementsService` deleted); no `@Roles()` remain, authorization is entirely the plugin's permission grants. `backend/scripts/announcements-cutover.js` (backup→copy→verify→grant, journaled/resumable like `legacy-adopt.js`) was run live as a real subprocess against real legacy `Announcement`/`AnnouncementRead` rows, and every route was then exercised end-to-end through the real dispatch path (15/15 checks — see [gate-c-announcements-cutover-2026-08-28.md](./acceptance/gate-c-announcements-cutover-2026-08-28.md)). Core's original tables/rows are kept, untouched, as the rollback path; dropping them is a deliberately deferred follow-up. 133 tests/build pass |
| PLG-005 | Persist lifecycle registry and versioned files | verified | Signed package installed and reloaded from PostgreSQL/volumes; removal preserved migration, setting, job, and namespaced table state before repository reinstall. The full install/update/disable/remove/reinstall/core-upgrade lifecycle was certified end-to-end against both supported PostgreSQL versions (16.x and 18.x per the support matrix) using the real service classes: data and migration history survive an update, a remove, and a reinstall identically on both versions; a core-version bump correctly blocks reactivation of a now-incompatible plugin without touching its data, then un-blocks once back in range (15/15 checks on each version — [gate-c-plugin-lifecycle-certification-2026-08-28.md](./acceptance/gate-c-plugin-lifecycle-certification-2026-08-28.md)). Also documents a real Postgres operational finding (a literal `SELECT *` re-run across a live schema-changing update can hit a stale prepared-plan error) as plugin-authoring guidance |
| PLG-006 | Provide plugin safe mode | verified | `PLUGIN_SAFE_MODE` skips startup loads and rejects activation while authenticated core plugin administration remains available; runtime tests/build pass |
| PLG-007 | Require inspection and exact-package confirmation | verified | Admin flow previews publisher, compatibility, dependencies, capabilities, permissions, and migration risk; install requires matching SHA-256 |
| PLG-008 | Execute recoverable plugin migrations | verified | Backup-before-migration and transactionally coupled SQL/history/registry implemented with namespace/immutability tests. A deliberately failing migration (valid SQL, real constraint violation) proved on live disposable PostgreSQL 16 that both the SQL and the migration history roll back together, staged files are removed, and a failed *update* visibly marks the existing registry row `failed` without touching the plugin's prior working version. Every lifecycle mutation now takes a transaction-scoped PostgreSQL advisory lock (serializing concurrent requests for the same plugin id, verified live), has an explicit 30s timeout, and self-heals a crash-orphaned install directory on retry (also verified live); 108 tests/build pass. See [gate-c-plugin-migration-lock-2026-08-28.md](./acceptance/gate-c-plugin-migration-lock-2026-08-28.md) |
| PLG-009 | Plugin review checklist and malicious-fixture suite | verified | `plugin-security-fixtures.spec.ts` proves all seven threat categories the master plan names for C-007: traversal (direct `safePackagePath` coverage), bombs (declared-uncompressed-size and oversized-package rejection, symlink entries), duplicate archive entries, SSRF (no HTTP/fetch/network capability exists at all, and the exact runtime context object is asserted key-for-key), and secret access (same context-key proof plus the existing cross-namespace SQL guard); tampering/capability abuse/migration abuse point to their existing dedicated suites rather than duplicating. [security-review-checklist.md](./plugins/security-review-checklist.md) is the paired human process, explicit that a plugin is trusted in-process code with no sandbox — review-before-signing covers what no test can (direct `process.env`/`child_process`/network calls in a plugin's own code). 157 tests/build pass. See [gate-c-plugin-security-review-2026-08-28.md](./acceptance/gate-c-plugin-security-review-2026-08-28.md) |
| MKT-001 | Official release repository | verified | Phase D D-001–D-007 are implemented: the isolated production Railway service uses managed PostgreSQL and persistent immutable artifact storage; restart/remove/restore and checksum drills passed; live old/new repository signatures both verify; compatibility/advisory metadata rejects tamper/replay/downgrade; release workflows produce SBOM/provenance/signatures and promote without rebuilding; school preflight requires backup/maintenance and records recovery; withdrawal/emergency-disable and outage/corruption/restore paths are tested. See [gate-d-official-repository-2026-08-28.md](./acceptance/gate-d-official-repository-2026-08-28.md) |
| MKT-002 | Marketplace commerce foundations | in progress | Manual and timestamped-HMAC online adapters share atomic payment/entitlement fulfillment; raw signed events are retained, sequential/concurrent duplicates deduplicate, event-ID collisions fail, failure-before-success recovers, and late failure cannot reverse success. Admin refund, dispute-forced reversal, for-cause entitlement revocation, and an overdue-expiry sweep all reuse the same transactional order/payment/entitlement ledger and fail closed against terminal states; entitlements persist their own `expiresAt` for the sweep. Distinct entitlement signing/local verification, commerce invariants, and reversal-lifecycle tests total 37 passing tests/build. All four migrations, including the reversal-lifecycle migration (`20260828070000`), apply cleanly to disposable PostgreSQL 16, and the real `CommerceService`/`PaymentWebhookService` classes were run live against it: admin refund (with idempotent retry), a dispute-forced reversal that revokes rather than refunds the entitlement, a won dispute that leaves the order untouched, manual revocation rejecting a repeat call, and the overdue-expiry sweep all passed (22/22 checks — see [gate-e-refund-dispute-revocation-postgres-2026-08-28.md](./acceptance/gate-e-refund-dispute-revocation-postgres-2026-08-28.md)). Customer identity/MFA (E-001), the installation registration challenge/key-rotation protocol (E-002), and the school-side entitlement cache with its fail-open outage / fail-closed tamper policy (E-005) are now implemented and unit-tested — 96 further passing tests across `apps/marketplace-api` (identity, installation registration, entitlement access) and `backend/src/marketplace` (installation key custody, registration client, entitlement verification, entitlement cache) — but none of the three has been run against a live PostgreSQL instance yet (Docker was unavailable this session), unlike the live-verified refund/dispute/revocation path above. FL policy sign-off on the refund/dispute rules (DEC-002/DEC-009), transactional email delivery and privacy review for E-001 (DEC-006/009/013, A-006), and live-database verification of E-001/002/005 remain |
| MKT-004 | Customer portal and protected acquisition | in progress | E-006/E-011 implementation now includes compatible public catalog, account-scoped ownership/orders/entitlements, server-priced checkout, Secure/HttpOnly marketplace session proxy, paid artifact authorization by eligible account or exact-digest installation signature, customer offline export, and school-side locally verified import/export. Marketplace 13 suites/114 tests, school boundary 6 suites/45 tests, cross-service 23/23 certification, and all three production builds pass. PostgreSQL-backed CI is defined; live deployment/browser execution remains. See [gate-e-customer-portal-and-protected-catalog-2026-08-29.md](./acceptance/gate-e-customer-portal-and-protected-catalog-2026-08-29.md) |
| MKT-003 | Controlled publisher governance | in progress | F-002–F-006 and F-009 platform controls are implemented: MFA-backed role membership, two-reviewer organization verification, dual-controlled keys, signed analyzed submissions, retained/two-person high-risk review, support and incident procedures, and append-only order/refund/correction/statement/payout reconciliation. Eight focused governance tests, the complete marketplace suite, build, and schema validation pass. F-001 candidate policies still require cross-functional approval; F-007 requires 3–5 real publishers/5–10 plugins; F-008 correctly returns `NO_GO` until the observed pilot outcomes exist. See [gate-f-publisher-governance-2026-08-29.md](./acceptance/gate-f-publisher-governance-2026-08-29.md) |
| ARC-001 | Customer/school privacy, terms, refund, and publisher-agreement requirements | in progress | [privacy-policy-v1.0.md](./policies/privacy-policy-v1.0.md), [terms-of-service-v1.0.md](./policies/terms-of-service-v1.0.md), and [refund-policy-v1.0.md](./policies/refund-policy-v1.0.md) are new engineering publication candidates, matching the convention already used for the publisher-facing policies (F-001); the publisher-agreement requirement was already satisfied by the existing [publisher-agreement-v1.0.md](./policies/publisher-agreement-v1.0.md). Retention periods reference [data-classification.md](./architecture/data-classification.md)'s tiers directly rather than re-deriving field sensitivity. Legal/Finance/Product Owner approval remains, and actual tax-jurisdiction content is explicitly deferred pending DEC-005 |
| ARC-002 | Versioned public contract catalog | verified | [contract-catalog.md](./architecture/contract-catalog.md) audits all five named surfaces (34 school REST controllers, 3 Socket.IO gateways, the plugin `api.routes`/`PluginRuntimeContext` contract, marketplace `/v1`/`/admin/v1`, both browser proxies) with a consumer map, a proposed breaking-change/deprecation policy modeled on the plugin SDK's own, and 5 concrete findings (a dead mobile call to a never-implemented `/auth/forgot-password` route; mobile's hard-coded production URL with no dev/staging split; zero API-versioning machinery on the school REST/WebSocket surface; one unintentionally unrestricted attendance-scan route; the class-registration public-intake surface). The required "one old-client compatibility fixture" ([`mobile-compatibility.e2e-spec.ts`](../backend/test/mobile-compatibility.e2e-spec.ts)) was live-run against a disposable PostgreSQL 16 and a real running backend: 28/28 checks pass, including a deliberate assertion that the known forgot-password gap still 404s today |

Phase A records: [technical ownership inventory](./architecture/technical-inventory.md), [support matrix](./architecture/support-matrix.md), [ADR index and eight subject records](./architecture/adr/README.md), the [six-workflow threat model](./architecture/threat-model.md), [customer policy documents](./policies/privacy-policy-v1.0.md), and the [contract catalog](./architecture/contract-catalog.md). The ADRs, threat model, and policies are implemented evidence, not silent approval: proposed business decisions and residual risks retain their named approval gates.

### Open-item execution mapping

| Baseline item | Master-plan work packages |
|---|---|
| SEC-001 | A-009 and cross-cutting Security/CI gates |
| SEC-004 | A-008 |
| DB-001 | A-002, A-007 and Data Privacy/Lifecycle |
| DB-002 | B-001–003 |
| INS-004 | B-004 |
| OPS-001 | A-005, B-005 and B-013 |
| ARC-001 | A-006 |
| ARC-002 | A-010 |
| MKT-002 | E-001–010 and F-001–008 |
| MKT-003 | F-001–009 |
| MKT-004 | E-006/E-010/E-011 |

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
