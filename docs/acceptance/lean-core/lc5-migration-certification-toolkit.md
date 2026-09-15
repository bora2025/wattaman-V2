# LC-5 Migration and certification toolkit

Status: complete

## LC5-001 — official plugin template

Implemented on 2026-09-14. `wattanam-plugin init <publisher>.<name>` creates:

- an SDK 1.1 manifest with required and optional dependency declarations;
- a backend lifecycle and permission-gated settings routes;
- a core-rendered declarative frontend descriptor;
- a safe namespaced starter migration whose SHA-256 is calculated after template rendering;
- English and Khmer translation dictionaries;
- README, changelog, permissions, data ownership and certification guidance.

The init test verifies substitutions, migration digest generation and every required directory. The
generated project is then suitable for `wattanam-plugin check`, test, pack and repository review.

## LC5-002 — package CLI

The public `wattanam-plugin` command now exposes the complete author workflow:

1. `init` creates the SDK 1.1 source project.
2. `validate` checks the manifest, declared files and migration digests without executing plugin code.
3. `test` repeats validation and activates the backend against the SDK test harness (`check` remains
   a compatibility alias).
4. `pack` creates a deterministic Ed25519-signed `.wtp` archive.
5. `inspect` rejects unsafe paths, duplicates, oversized files, missing/unsigned payloads and digest
   mismatches, then reports package identity, signer metadata and artifact digest.
6. `publish` submits the inspected archive to the authenticated official repository endpoint.

`workflow.spec.js` exercises init → validate → test → key generation → pack → inspect as one local
pipeline; repository submission remains isolated behind the existing mocked publish contract test.

## LC5-003 — adoption preflight

`legacy-preflight.js` remains read-only and now reports a structured `adoptionReadiness` decision.
Operators must supply the reviewed `ADOPT_APPROVED_SCHEMA_FINGERPRINT` and
`ADOPT_TARGET_CAPACITY_BYTES`. The source must be an unadopted legacy schema on PostgreSQL 14–18,
and declared target capacity must cover twice the current database size plus 256 MiB of migration
headroom. `legacy-adopt.js` enforces the same decision before backup, journal or database mutation.
The standalone command returns exit code 2 for a non-ready source so CI and operator scripts fail
closed instead of parsing human-readable output.

## LC5-004 — zero-write dry run

`npm run db:legacy:dry-run` reuses the guarded adoption inputs and read-only preflight, verifies the
named owner with a SELECT, and exits before resolving or creating the backup directory. Its JSON
plan identifies the source and target, all five cutover stages, readiness blockers and the expected
row-count, relationship, content-hash and credential-format reconciliation checks. No backup,
journal, migration record, installation row, setting or audit row is written.

## LC5-005–009 — controlled adoption

`plugin-adoption-toolkit.js` provides identity-bound atomic journals, cursor-based chunking,
idempotency keys, progress callbacks, exclusive maintenance ownership, five-dimension
reconciliation and routing-only rollback. Its test repeats the migration with a simulated process
kill after each of four chunk checkpoints and proves one seven-row authoritative result every time.
`compatibility-proxies.json` gives the announcements bridge an owner and core 2.0.0 removal target;
CI enforces its source-size ceiling and absence of Prisma access.

## LC5-010–013 — certification

Run:

`npm run certify:plugin:migration -- --out <report.json>`

The 2026-09-14 certification passed all **82 checks**: adoption/proxy 7, lifecycle/reference package
38, recovery 12 and security 25. The generated report digest was
`929ecc0ade6ad6dd33a902b8ece77f1b7002e76d84d6820985cf67303e2c583e`. Each suite records its
duration, test count and complete-output SHA-256; failures also retain a bounded diagnostic. The
runner invokes Node/Jest directly, so results do not depend on Bash, PowerShell or npm shell rules.
