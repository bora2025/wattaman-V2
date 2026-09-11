# LC2 core-only composition acceptance

Date: 2026-09-11

## Result

LC2 is complete and live-certified against disposable PostgreSQL 16 and PostgreSQL 18 databases.

## LC2-017 — Identity

- Core-mode user reads, lists, searches, updates and deletes select only the closed core `User`
  graph; schedule/profile-domain endpoints fail before querying business tables.
- Core setup permits only `SUPER_ADMIN` and `ADMIN` accounts until a business plugin owns another
  role. The core UI hides the legacy bulk-role workflow.
- Password recovery uses expiring, single-use hashed tokens, invalidates prior reset links, and
  revokes sessions after reset.
- TOTP MFA uses a 160-bit Base32 secret, AES-256-GCM encrypted at rest, ±one 30-second window, and
  eight single-use hashed recovery codes. Setup requires the current password. Login accepts an
  authenticator or recovery code without returning MFA material to the browser.
- The administrator profile provides MFA enrollment; login accepts the second factor. Both the
  encrypted seed and recovery-code hashes are explicitly classified as Tier 4 credentials.

Evidence: `src/auth` 37 tests, including core distribution, reset, session rotation and MFA suites.

## LC2-018 — Marketplace

- Link start/poll/status/revoke, delegated-token rotation, catalog, orders, entitlements, and
  marketplace installation remain in the core module graph.
- The Plugin Manager contains no package file input. The only user-facing acquisition action is a
  verified marketplace catalog installation.
- Marketplace installation reuses checksum/signature verification and plugin lifecycle controls.

Evidence: marketplace, entitlement, installation-key, link and plugin lifecycle suites plus the
LC2 completion contract.

## LC2-019 — Billing control

- Hourly synchronization delivers invoice, due-soon, final-notice, suspension, reactivation and
  payment-received notifications to `SUPER_ADMIN` and `ADMIN` accounts.
- Final notice precedes the central suspension date; the global guard returns HTTP 402 for normal
  APIs after suspension.
- Authentication, health, billing/payment recovery and school-access status remain reachable.
- Confirmed central reactivation is applied automatically. A signed payment submission triggers a
  prompt resync. The seven-day control-plane outage fails open with an explicit owner notification.

Evidence: school billing/access/payment/lock tests.

## LC2-020 — Backup and restore

- PostgreSQL custom-format backups and full recovery sets are schema-neutral and include plugin
  files/data.
- Backup manifests now record schema lineage. Restore rejects a core/legacy mismatch before
  replacement and verifies the restored lineage afterwards.
- The destructive restore requires archive checksum, exact target confirmation, `--yes-replace`,
  an automatic pre-restore backup for non-empty targets, a single transaction, and post-restore
  identity verification.
- The quarterly drill compares every restored table/content/FK and measures the four-hour RTO.

The production-shaped PostgreSQL 18 recovery-set drill passed with exact identity across 23 tables,
zero row loss/content drift/FK orphans, valid owner password hashes, and a measured restore time of
0.362 seconds against the four-hour RTO. Evidence:
`lc2-core-restore-drill-2026-09-11.json`.

## LC2-021 — Updates

- Signed repository metadata, replay watermark, semantic-version compatibility and active-plugin
  blockers run on the core schema.
- Core preparation creates a verified backup before writing the maintenance flag.
- Mutations are blocked in maintenance mode; health and the completion callback remain available.
- Failed health completion records `recovery_required` with the exact restore archive/procedure;
  healthy completion removes maintenance mode atomically.

Evidence: update, repository-signature, configuration and maintenance middleware suites.

## LC2-022 — Observability

- Liveness, readiness, version/distribution, migration/install diagnostics and backup status query
  only core tables or PostgreSQL metadata.
- Prometheus includes process/HTTP, DB, migration, plugin-job, entitlement and backup signals.
- Structured request logs retain request correlation. Audit append/list/retention remains composed;
  core label enrichment cannot query a removed business table.

Evidence: health, metrics, structured logger and audit tests plus core module registry.

## LC2-023 — Legacy regression

- An unset distribution remains `legacy-full`.
- `legacy-full` composes all 37 registered modules and retains the original Prisma migration path.
- Core-only branches are conditional and do not change legacy service queries.
- The full backend regression run passes: 66 suites, 379 tests.
- Windows dynamic-plugin fixtures now live under Jest's repository root so the regression is
  reproducible without changing the production plugin loader.

## Automated commands

```text
backend: npm test -- --runInBand                       PASS (66 suites, 379 tests)
backend: npm run build                                 PASS
frontend core: npm run build                           PASS (120 routes)
root: npm run test:tools                               PASS (54 tests)
root: npm run architecture:inventory:gate              PASS
root: npm run architecture:inventory:check             PASS
root: npm run schema:core:check                         PASS (21 models)
```

## Live acceptance result

- Clean PostgreSQL 16 API and worker boot: **PASS**.
- Guarded CLI and interactive web-path installations: **PASS**.
- Core recovery-set PostgreSQL 18 source-to-target restore: **PASS**.
- Missing/incompatible schema lineage fail-closed checks: **PASS**.
