# Gate C Plugin Developer Tooling (CLI, Typed SDK, Harness, Templates, Publish) — 2026-08-28

## Result

**C-008**, the last open Phase C item, is complete. Two new public packages replace the informal `backend/scripts/plugin-package.js`/`generate-plugin-key.js`: `@wattanam/plugin-sdk` (types, manifest validation, local test harness) and `@wattanam/plugin-cli` (the `wattanam-plugin` binary: `init`/`check`/`keygen`/`pack`/`publish`). A **new** reference plugin (`wattanam.noticeboard`, distinct from `plugins/announcements`) was generated, checked, signed, **installed against a real backend with genuine Ed25519 signature verification** (not stubbed), and **submitted to a real marketplace-api instance**, closing the acceptance criteria literally: "A new reference plugin is generated, tested, signed, installed and submitted using public tooling only."

## Scope note: "submitted" means the existing admin endpoint, not new open publishing

Research before implementation confirmed `apps/marketplace-api`'s only publish route (`POST /admin/v1/plugin-releases`) is gated by a shared operator bearer token, not publisher-signed self-service submission — a **deliberate DEC-007 decision** ("Wattanam-only through Milestone E; invited verified publishers in F pilot; no open upload in V1"). Real open-submission is tracked separately as `F-003`, correctly gated behind Gate F0. `wattanam-plugin publish` calls the existing admin endpoint with public, reusable tooling — it does not open new third-party submission, which would have been scope creep beyond this phase and contrary to DEC-007.

## What was built

- **`packages/plugin-sdk/`** (`@wattanam/plugin-sdk`, no workspace tooling existed in this repo before — this is a new, standalone, non-private package): `types.ts` (framework-independent copies of every SDK 1.0 type, `Logger` as a minimal structural interface instead of an `@nestjs/common` import), `manifest.ts` (`PLUGIN_CAPABILITIES` + a pure `parsePluginManifest()` matching the real backend verifier's rules exactly, throwing plain `Error`), `harness.ts` (`createTestContext()` — a local, backend-free, framework-agnostic test harness generalizing the mock-context pattern already proven in `reference-plugin.spec.ts`). Kept in sync with the backend by a "twin pinning" comment/test in each repo (not a runtime dependency, to avoid coupling backend's build to a new package this late) — `plugin-sdk-contract.spec.ts` and this package's own `manifest.spec.ts` each independently pin the identical capability list.
- **`packages/plugin-cli/`** (`@wattanam/plugin-cli`, binary `wattanam-plugin`, hand-rolled argv dispatch — no new CLI-framework dependency, matching this repo's existing scripts' style): `init` (scaffolds `templates/default/` — the **templates** deliverable), `check` (the **compatibility test kit**: manifest validation, migration-checksum verification, entry-point existence, and an `activate()` smoke test against the harness — all without a running backend), `keygen`/`pack` (ported from the retired backend scripts, verified byte-for-byte equivalent), `publish` (new — calls the real admin endpoint via Node's built-in `fetch`/`FormData`, no HTTP library dependency).
- **Retired**: `backend/scripts/plugin-package.js`, `generate-plugin-key.js`, and the `plugin:pack`/`plugin:keygen` npm scripts. `backend/src/plugins/plugin-package-tool.spec.ts` (previously exercising the retired script) now requires the new CLI's `packPlugin` instead — this is now the **permanent, CI-relevant proof** that the public CLI's pack output stays byte-compatible with the real backend `PluginPackageVerifier`, not just a one-off manual check.
- **Docs**: `packages/plugin-sdk/README.md`, `packages/plugin-cli` usage (in the generated template's own README), `docs/plugins/upgrade-guide.md` (new — the **upgrade guide**: immutable migration history, version-bump steps, what an update cannot do), `docs/plugins/package-and-runtime.md`'s signing example updated to the new CLI.

## A real bug the templates test caught

The first `check` run against a freshly-scaffolded plugin failed: the template's `plugin.json` declared a `navigation` entry and called `context.permissions.register(...)` in `backend/index.js`, but its `capabilities` array was missing `navigation.register` and `permissions.register`. This is exactly the kind of defect the compatibility test kit exists to catch before a real plugin author hits it — fixed in the template, and now covered by `init.spec.js`/`check.spec.js` running the real scaffold through the real validator.

## Live, cross-service proof (Docker, disposable Postgres for both services)

A new plugin, `wattanam.noticeboard` (one migration, two real routes using `database.read`/`database.write`), was generated and carried through the full pipeline:

```text
PASS plugin.json is a valid manifest
PASS migration file exists: migrations/001_create_notices.sql
PASS migration checksum matches plugin.json: 001_create_notices
PASS entry file exists: backend/index.js
PASS entry file exists: frontend/page.json
PASS backend entry exports { id, activate }
PASS activate(context) runs against the local harness without throwing
ALL CHECKS PASSED (wattanam-plugin check)
```

**Installed** — against a real disposable PostgreSQL 16 backend, using the **real** `PluginPackageVerifier` with genuine Ed25519 signature verification (not stubbed, unlike most of this session's other live proofs — this one specifically needed to prove the CLI's signature is one the real verifier actually accepts):

```text
PASS install() accepts the real signed package (genuine verification, not stubbed)
PASS a real route dispatched through the real migrated table works end to end
PASS the notice is readable back through the live dispatch path
PASS the row genuinely exists in Postgres, created by the CLI-generated migration
```

**Submitted** — against a real `apps/marketplace-api` instance (own disposable PostgreSQL 16, real HTTP server, real admin endpoints): registered the CLI-generated public key as a `VERIFIED` publisher, then ran `wattanam-plugin publish` for real. The signed repository index (`GET /v1/index`) subsequently listed the new release with the exact manifest and correct `sha256`, and the artifact downloaded successfully (`GET /v1/artifacts/:sha256` → HTTP 200, exact byte count).

### A real, unrelated bug found and deliberately not touched

While standing up marketplace-api for the "submitted" step, a schema/migration drift was discovered: the *current, uncommitted* `apps/marketplace-api/prisma/schema.prisma` (from concurrent Phase D/F work in this repo) declares a substantial publisher-governance feature (`PublisherMember`, `PublisherPolicy`, `PluginSubmission`, `SubmissionReview`, `PublisherRevenueEntry`, `PublisherStatement`, `PublisherPayout`, plus four new `PublisherKey` columns) with no corresponding migration anywhere — `prisma migrate deploy` succeeds silently but leaves a fresh database missing columns/tables the generated Prisma Client expects, breaking `POST /admin/v1/plugin-releases` (and likely other publisher-key queries) with a real `P2022` error. This is **not part of C-008** and was **not fixed here** — it belongs to that in-progress, uncommitted work, and touching someone else's mid-flight schema without knowing their intended migration boundaries would have been irresponsible. The "submitted" proof above was completed against an isolated copy of `apps/marketplace-api` pinned to the last **committed**, self-consistent schema+migration state (`git show HEAD:...`), built with its own independent `node_modules` (a first attempt accidentally symlinked into the real package's `node_modules` and regenerated its Prisma client from the wrong schema — caught immediately and reverted by regenerating from the real, current schema before any other work could observe it). This drift should be flagged to whoever owns the concurrent publisher-governance work.

## Automated unit verification

```text
Backend suite: 39 passed, 39 total (199 tests)
@wattanam/plugin-sdk: 2 passed, 2 total (12 tests)
@wattanam/plugin-cli: 5 passed, 5 total (10 tests)
```

## Open items

- No real npm publish happened (`@wattanam/plugin-sdk`/`@wattanam/plugin-cli` are structured to be publishable — non-private, proper `main`/`types`/`bin` fields — but were not pushed to any registry). Whether/when to actually publish is a business decision, not part of this technical deliverable.
- The schema/migration drift described above is a real, currently-live bug in `apps/marketplace-api` and should be raised with whoever owns that in-progress work — it is not resolved by this change.
- `packages/` is a new top-level convention in this repo (no prior workspace tooling existed); the two packages are independently `npm install`ed (via a `file:` dependency from `plugin-cli` to `plugin-sdk`), not wired into any workspace/monorepo tool, matching how the rest of this repo already manages independent subprojects.
