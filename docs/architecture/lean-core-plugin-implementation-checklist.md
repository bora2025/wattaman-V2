# Lean Core and Module-to-Plugin Implementation Checklist

Status: **LC-0, LC-1, LC-2, LC-3 and LC-5 complete; LC-4 partially accepted;
MP-1 underway; MP-2 through MP-9 and LC-F not complete**
Last full checklist reconciliation: 2026-09-25 — **121 complete, 45 open, 11 partial, 0 blocked**.
Created: 2026-09-11  
Architecture plan: [Wattanam Lean Core and Plugin-First Architecture](./wattanam-lean-core-plugin-first-plan.md)  
Migration plan: [Business Modules to Official Plugins](./module-to-plugin-migration-plan.md)

## How to use this checklist

- `[ ]` not started
- `[~]` in progress but not accepted
- `[x]` implemented, tested and supported by linked evidence
- `[!]` blocked; record the blocker and owner beside the item

Do not mark an item complete because code exists. Completion requires its acceptance condition and
evidence. Store durable evidence under `docs/acceptance/lean-core/`.

## Gate LC-0 — Approve architecture decisions

No module extraction starts before this gate is complete.

All thirteen items were approved by product owner Bora on 2026-09-11. The decisions, including
where they refine or depart from the earlier plans, are summarized
in [lc0-architecture-decisions.md](../acceptance/lean-core/lc0-architecture-decisions.md).

- [x] **LC0-001 Product boundary** — accept lean core plus plugin-first as the target distribution.
  Record: [ADR-0009](./adr/0009-lean-core-product-boundary.md).
- [x] **LC0-002 DEC-004** — amend/supersede the earlier base-module decision that treats academic
  structure and attendance as permanent core. Record: [ADR-0009](./adr/0009-lean-core-product-boundary.md).
- [x] **LC0-003 Identity ownership** — accept: core owns generic person/account/contact/membership;
  Academic Management owns student/class/enrollment; Human Resources owns employee profile.
  Record: [ADR-0010](./adr/0010-identity-ownership.md).
- [x] **LC0-004 Plugin UI** — accept declarative UI v2 as the first production UI extension model;
  arbitrary plugin JavaScript is not executed in the core origin. Record: [ADR-0011](./adr/0011-plugin-ui-declarative-v2.md).
- [x] **LC0-005 Runtime trust** — accept official/reviewed in-process plugins only until a separate
  isolation/governance decision permits third parties. Record: [ADR-0012](./adr/0012-plugin-runtime-trust.md).
- [x] **LC0-006 Artifact delivery** — accept digest-addressed artifact storage and independent
  verified API/worker caches for Railway. Record: [ADR-0013](./adr/0013-plugin-artifact-delivery.md).
- [x] **LC0-007 Data preservation** — accept disable/remove preserving data by default and a separate
  confirmed purge operation. Record: [ADR-0014](./adr/0014-plugin-data-preservation.md).
- [x] **LC0-008 Event consistency** — accept versioned outbox events, idempotent consumers, retry and
  dead-letter handling; no distributed cross-plugin transaction. Record: [ADR-0015](./adr/0015-cross-plugin-event-consistency.md).
- [x] **LC0-009 Entitlements** — distinguish whole-school platform billing from per-plugin licenses,
  including offline grace, expiry, clock skew and anti-replay. Record: [ADR-0016](./adr/0016-billing-lock-and-plugin-entitlements.md).
- [x] **LC0-010 Compatibility** — approve supported core/SDK/runtime/plugin/PostgreSQL/Node/browser/
  mobile version windows. Record: [ADR-0017](./adr/0017-compatibility-windows.md).
- [x] **LC0-011 Communication scope** — `wattanam.announcements` remains standalone;
  `wattanam.communication` owns messages and posts, and both are sold as one bundle.
  Record: [ADR-0018](./adr/0018-communication-scope.md).
- [x] **LC0-012 Attendance ownership** — confirm student school-day attendance, staff attendance,
  timetable teacher attendance and course attendance owners. Record: [ADR-0019](./adr/0019-attendance-ownership.md).
- [x] **LC0-013 Governance record** — record approver, decision date, rationale and superseded docs.
  Record: [lc0-architecture-decisions.md](../acceptance/lean-core/lc0-architecture-decisions.md).

Acceptance:

- [x] All thirteen decisions have accepted ADRs/governance results.
- [x] `module-boundaries.md` and the architecture master plan agree with those ADRs.
- [x] No contradictory core/module classification remains.

Evidence: `docs/acceptance/lean-core/lc0-architecture-decisions.md`

## Gate LC-1 — Reproducible current-state inventory

- [x] **LC1-001 Module scanner** — deterministic inventory enumerates Nest module files and identifies
  the root `AppModule`; semantic import-edge extraction remains part of LC1-012.
- [x] **LC1-002 Prisma scanner** — model fields/types/attributes, named and implicit relations,
  indexes, mapped tables and mapped columns are deterministically enumerated.
- [x] **LC1-003 API scanner** — controllers, class prefixes/names, composed route paths, handlers,
  class/method guards, effective roles, parameter decorators, referenced DTO/input types and
  school-web/mobile/workspace API consumers are enumerated. Static school calls are matched by HTTP
  method to backend route patterns; dynamic expressions and central-service proxy calls stay
  explicitly classified for manual ownership review.
- [x] **LC1-004 Frontend scanner** — Next.js pages/routes, API proxy handlers, relative import
  relationships, shared components with importers/dependencies, and statically detectable deep-link
  consumers are deterministically enumerated.
- [x] **LC1-005 Navigation scanner** — navigation export sets, hrefs, labels, sections, icons, badges
  and source lines are deterministically enumerated; role context follows the named exported set.
- [x] **LC1-006 Runtime scanner** — scheduled handlers/schedules/process ownership, actual WebSocket
  gateways/namespaces/guards/connection security/subscribed events, and dynamic plugin job
  registrations are deterministically enumerated.
- [x] **LC1-007 Files scanner** — multipart handlers, browser file inputs, downloads, CSV/PDF/Excel/
  print generation, filesystem operations, persistent-path/environment references and plugin
  storage calls are deterministically enumerated.
- [x] **LC1-008 Notifications scanner** — delivery channels and call-site recipient/template
  expressions, in-app database writes, directory recipient resolution, preference access, plugin
  quota controls, notification-related API consumers and digest schedules are deterministically
  enumerated.
- [x] **LC1-009 Reports scanner** — report files/pages/routes/API consumers, query filters,
  collection/database/aggregate/named-metric calculations, export-generation sites and print pages/
  actions are deterministically enumerated.
- [x] **LC1-010 Mobile scanner** — screens/components, registered navigation and navigation calls,
  API dependencies, secure persistence, offline/network behavior, native capabilities, configured
  permissions/plugins and package dependencies are deterministically enumerated.
- [x] **LC1-011 Ownership manifest** — every discovered item (1,293 modules, models, controllers,
  routes, pages, navigation entries, jobs, gateways, plugin jobs, proxies, files and mobile
  configuration entries) resolves to exactly one owner from the reviewed
  [ownership manifest](./ownership-manifest.json). Records inside a file (notifications, reports, file
  storage, consumers) are owned through that file. 232 owners stay provisional until LC0-003, LC0-011,
  LC0-012 and MP1-002 are accepted.
- [x] **LC1-012 Dependency graph** — 1,326 cross-owner references are generated and classified. They
  cover imports, Prisma table access, foreign keys, API calls, links, navigation and SDK capabilities:
  - 179 core-to-feature references, each naming the checklist item that removes it;
  - 22 undeclared feature-to-feature dependencies;
  - one feature cycle across ten plugins, which remains after the split plans.

  The findings are recorded, not yet fixed.
- [x] **LC1-013 Data classification** — all 82 models and 135 sensitive fields are tagged in the
  machine-checked [data classification](./data-classification.json), which keeps A-002's tiers and adds
  personal, child, financial, credential and location. Every student-linked model is child data, and a
  new sensitive-looking field must be classified or reviewed. Every outbound call and external
  notification channel maps to one of 7 external destinations, and each owner has a category rollup
  for its privacy declaration.
- [x] **LC1-014 CI drift check** — `npm run architecture:inventory:gate` runs first in PR validation.
  It fails only when a new module, model, route, page, job or file is unowned or unclassified, or when a
  manifest has an error or a stale entry. It lists what to fix and which manifest to edit; the drift
  check and repository tests follow. The review workflow is in the LC-1 evidence.

Baseline expected by the first run:

- [x] 39 Nest feature modules are reconciled.
- [x] 82 Prisma models are reconciled.
- [x] 136 Next.js page files are reconciled.
- [x] `plugins/announcements` is recorded as the existing official plugin (`wattanam.announcements`).

Acceptance:

- [x] No unowned table, route, page, job, gateway, report, notification or file path remains.
- [x] Mixed modules have a documented split plan rather than a guessed owner (8 split plans).

Evidence: [LC-1 structural inventory evidence](../acceptance/lean-core/lc1-current-state-inventory.md),
the reviewed [ownership manifest](./ownership-manifest.json) and the generated
[current architecture inventory](./generated/current-architecture-inventory.json).

## Gate LC-2 — Core-only composition milestone

Milestone name: **LC-M1 Core-only composition and architecture enforcement**.

### LC-2A Distribution profiles

- [x] **LC2-001 Configuration** — typed runtime configuration accepts only
  `WATTANAM_DISTRIBUTION=core|legacy-full`; API/worker startup logs expose the selected profile and
  Compose plus environment templates carry the setting. Evidence: [LC-2 distribution profiles](../acceptance/lean-core/lc2-distribution-profiles.md).
- [x] **LC2-002 Safe default** — absent configuration, both Compose runtime roles, environment
  templates and automated Railway provisioning all preserve `legacy-full`; a contract test prevents
  switching provisioning to `core` before the clean-install gate is accepted. Evidence:
  [LC-2 distribution profiles](../acceptance/lean-core/lc2-distribution-profiles.md).
- [x] **LC2-003 Module registry** — the typed root registry classifies every local module imported
  by `AppModule` exactly once as core, shared, proxy or business, records its future owner, and fails
  tests when composition drifts. Evidence: [LC-2 module registry](../acceptance/lean-core/lc2-module-registry.md).
- [x] **LC2-004 Backend composition** — API and worker bootstrap `AppModule.register(distribution)`;
  the dynamic root consumes the registry and includes only core/shared modules for `core`, while
  `legacy-full` retains all 37 local roots. Evidence: [LC-2 module registry](../acceptance/lean-core/lc2-module-registry.md).
- [x] **LC2-005 Worker composition** — the worker uses the same registry-filtered dynamic root as
  the API; a source-to-registry contract inventories all seven scheduled handlers and three
  gateways and proves no business runtime owner is selected in `core`. Evidence:
  [LC-2 module registry](../acceptance/lean-core/lc2-module-registry.md).
- [x] **LC2-006 Seed composition** — development seeding uses the validated distribution profile;
  `core` selects only a generic admin identity fixture, while departments, teacher/student/parent
  identities, classes and student records remain in an explicit `legacy-business-demo` section.
  The reviewed seed registry and contract tests prevent business models from entering core seeds.
  Evidence: [LC-2 seed composition](../acceptance/lean-core/lc2-seed-composition.md).
- [x] **LC2-007 Configuration validation** — API, worker and seed entrypoints share the validated
  `core | legacy-full` contract; API and worker validators run before Nest application creation and
  reject unknown profiles with the offending value and exact supported choices. Entrypoint role
  mismatches remain explicit. Evidence:
  [LC-2 configuration validation](../acceptance/lean-core/lc2-configuration-validation.md).

### LC-2B Frontend composition

- [x] **LC2-008 Navigation registry** — administrator navigation now has an authoritative typed
  registry classifying every static entry as `core` or `legacy-business`; distribution selection
  removes legacy business entries from `core`, and authorized server-provided plugin entries are
  normalized as identified `plugin` contributions and composed through the same registry function.
  Evidence: [LC-2 frontend navigation registry](../acceptance/lean-core/lc2-frontend-navigation-registry.md).
- [x] **LC2-009 Core navigation** — the core profile exposes exactly Dashboard, Users, Plugins,
  Marketplace, Settings, Backup/Restore, Updates/Health, Platform Billing and Audit/Security. A
  dedicated authorized system page reports runtime, database, migrations, backup and update state;
  the exact nine-link set is regression-tested. Evidence:
  [LC-2 core navigation](../acceptance/lean-core/lc2-core-navigation.md).
- [x] **LC2-010 Route policy** — a Next.js request boundary returns 404 for legacy business pages
  in `core`, including direct/bookmarked URLs; core identity, operations, marketplace, plugin-host
  and empty portal-shell surfaces remain available, static assets are unaffected, and
  `legacy-full` preserves every existing route. Evidence:
  [LC-2 frontend route policy](../acceptance/lean-core/lc2-frontend-route-policy.md).
- [x] **LC2-011 Dashboard extensions** — `core` mounts a separate operations dashboard that makes
  no attendance/reporting/realtime business calls; feature cards are projected only from active,
  permission-filtered, namespaced plugin contributions, while `legacy-full` retains the existing
  dashboard. Evidence:
  [LC-2 dashboard extensions](../acceptance/lean-core/lc2-dashboard-extensions.md).
- [x] **LC2-012 Search extensions** — SDK 1.0 plugins opt into search by registering a permission-
  gated `GET search` route; core discovers only active providers, reuses audited dispatch grants and
  timeouts, validates namespaced results, and isolates provider failures. The core search UI calls
  only this aggregator, while `legacy-full` keeps the existing cross-business search. Evidence:
  [LC-2 search extensions](../acceptance/lean-core/lc2-search-extensions.md).
- [x] **LC2-013 Empty experience** — when no permitted active plugin contributes a feature card, the
  core dashboard explains why optional modules are absent and presents a progress-aware three-step
  flow to link the marketplace, browse plugins, and install/activate them; every CTA targets a route
  admitted by the core policy. Evidence:
  [LC-2 empty experience](../acceptance/lean-core/lc2-empty-experience.md).

### LC-2C Core-only data and operations

- [x] **LC2-014 Clean schema design** — accepted dual-lineage design gives fresh core and existing
  legacy databases separate immutable schema/migration paths, derives the exact 21-model core set
  from accepted ownership, records every current cross-owner identity relation that must be split,
  prohibits in-place destructive conversion, and defines lineage, client, plugin migration,
  backup/restore and LC2-015 boot gates. Evidence:
  [clean core database schema design](./core-database-schema-design.md) and
  [machine-readable contract](./core-schema-contract.json).
- [x] **LC2-015 Clean database boot** — the isolated 21-model core schema, baseline migration,
  immutable lineage markers, distribution-aware Docker/Railway migration selection and fail-closed
  core startup guard are implemented and live-verified on disposable PostgreSQL 16: API and worker
  readiness pass, no optional table exists, legacy routes are absent, and invalid lineage fails
  closed. Evidence:
  [LC2 clean database boot](../acceptance/lean-core/lc2-clean-database-boot.md).
- [x] **LC2-016 Installation** — interactive and unattended paths now share DTO, preflight and
  serializable persistence; the CLI selects the core migration lineage, and contract tests prove
  setup touches only core-owned data without bootstrapping optional plugins. Backend and core
  frontend production builds pass. Clean PostgreSQL CLI and interactive web-path installations,
  owner login, and repeat rejection pass. Evidence:
  [LC2 clean installation](../acceptance/lean-core/lc2-clean-installation.md).
- [x] **LC2-017 Identity** — core-safe owner/admin management, password recovery, session revocation,
  encrypted TOTP MFA, single-use recovery codes and administrator enrollment UI are implemented and
  tested without business-table access.
- [x] **LC2-018 Marketplace** — link, unlink, delegated-session rotation, catalog, orders,
  entitlements and marketplace-only verified plugin installation are implemented; the local package
  upload entry is absent.
- [x] **LC2-019 Billing control** — invoice notice, final notice, suspension, signed payment recovery,
  outage fail-open notification and automatic reactivation work with zero business plugins.
- [x] **LC2-020 Backup/restore** — backup/recovery sets are schema-neutral and manifests bind and
  verify core/legacy lineage before and after restore. A real PostgreSQL 18 source-to-target drill
  restored exact identity across 23 tables in 0.362 seconds with zero drift or FK orphans.
- [x] **LC2-021 Updates** — signed update preflight, compatibility blockers, backup-before-maintenance,
  maintenance mode, healthy completion and explicit rollback recovery path pass automated tests.
- [x] **LC2-022 Observability** — health, metrics, structured request logs and audit remain composed
  and core-safe, including business-label enrichment isolation.
- [x] **LC2-023 Legacy regression** — `legacy-full` remains the default, composes every registered
  module, keeps its migration lineage and passes the complete backend regression suite.

Acceptance:

- [x] Core-only backend, worker and frontend production builds pass.
- [x] Core-only install and boot pass on a clean supported PostgreSQL database.
- [x] No business module provider, route, job, gateway or static navigation is active.
- [x] Legacy-full regression suite passes without destructive migration.

Evidence: `docs/acceptance/lean-core/lc2-core-only-composition.md`

## Gate LC-3 — Plugin UI v2

- [x] **LC3-001 Schema/version** — UI schema v2 defines a declarative bundle of typed pages,
  permission-bound data sources and allow-listed components; v1 settings descriptors remain
  supported during migration.
- [x] **LC3-002 Security** — the activation-time parser fails closed on scripts, HTML/event-handler
  injection, JavaScript/external URLs, unknown component types, excessive nesting and namespace
  escape.
- [x] **LC3-003 Data source** — every component source resolves to a descriptor-local data source;
  every source declares a plugin-namespaced manifest permission and dispatch retains the actual
  route permission check.
- [x] **LC3-004 Routing** — declarative pages support static list/create paths and typed dynamic
  detail/edit paths; static routes win over parameter routes, declared UUID/integer/slug/string
  values are validated before loading, and API dispatch safely captures namespaced parameters.
- [x] **LC3-005 Tables** — the allow-listed table renderer provides sortable/filterable declared
  columns, bounded client pagination, optional row selection and distinct initial-empty,
  filter-empty, loading and per-source error states with responsive overflow.
- [x] **LC3-006 Forms** — allow-listed create/edit forms provide typed field validation,
  conditional visibility, bounded select choices, initial GET data, field/global server errors,
  confirmation prompts, busy/success feedback and refresh after successful mutation.
- [x] **LC3-007 Actions** — declarative mutation actions support POST/PUT/PATCH/DELETE,
  confirmations and destructive presentation; table selections feed sequential bulk execution with
  live completed/failed progress, partial-failure summaries and post-action refresh.
- [x] **LC3-008 Dashboard** — host-owned metric/trend cards, key/value cards, mapped status
  indicators and bounded responsive bar/line/pie charts consume validated GET sources and expose
  loading, empty, error and screen-reader representations.
- [x] **LC3-009 Files** — capability-gated binary storage preserves per-plugin namespaces and
  limits; declarative file components provide safe-type bounded uploads, parameterized downloads,
  confirmed deletion and sandboxed image/PDF/text previews with object-URL cleanup.
- [x] **LC3-010 Print/export** — declared fields render in a print-safe table and export through
  bounded host-owned UTF-8 CSV and PDF actions with safe filenames.
- [x] **LC3-011 Realtime** — authenticated user-room subscriptions accept only plugin-namespaced
  events and debounce refreshes of declared autoload GET sources.
- [x] **LC3-012 Scanner input** — host-owned camera QR/barcode and keyboard-wedge input share one
  permission-gated mutation source with length checks and duplicate debounce.
- [x] **LC3-013 Localization** — bounded descriptor dictionaries provide English/Khmer fallback;
  host formatting uses the installation locale, IANA timezone and ISO currency for declared
  number/currency/date/datetime values.
- [x] **LC3-014 Accessibility** — the signed sample's real list/create/print surface passes
  keyboard-focus checks and an axe scan with no serious or critical semantic/contrast findings.
- [x] **LC3-015 Responsive UI** — list/create/print and detail/edit workflows pass without document
  overflow on phone, tablet and desktop Playwright projects.
- [x] **LC3-016 Permission parity** — the same persisted role grant filters v2 navigation and page
  discovery and remains the authoritative audited check at API dispatch; denied deep links fail.

Acceptance:

- [x] A signed sample plugin adds a real list/form/detail/print workflow.
- [x] Installing/enabling it requires no core frontend rebuild or redeployment: the signed artifact
  is discovered by the runtime and rendered by the existing generic host.
- [x] Disabling it removes its navigation/pages and blocks direct API/deep-link data access.
- [x] Malformed and hostile descriptors fail closed.

Evidence: `docs/acceptance/lean-core/lc3-plugin-ui-v2.md`

## Gate LC-4 — Runtime, artifacts and cross-plugin contracts

### LC-4A Artifact distribution

- [~] **LC4-001 Artifact origin** — SHA-256-addressed local/S3 providers, provider-boundary digest
  checks, create-only S3 writes and streaming reads are implemented and tested. Concurrent API
  create races now converge only after validating the winning object's immutable metadata, and a
  checked-in restart/multi-instance/overwrite live-drill command exists. Required PR CI now runs
  that drill against a pinned disposable MinIO origin. The local production-shaped execution
  passes; CI now builds the exact pinned release from source after the Docker Hub image was removed,
  and its workflow passes `actionlint`. Its first remote green execution and the hosted
  production-shaped service's non-secret evidence record remain.
- [x] **LC4-002 API cache** — each API process seeds/fetches a digest-addressed package, verifies the
  archive and publisher signature, and atomically rebuilds a missing/damaged runtime directory
  before activation.
- [x] **LC4-003 Worker cache** — the same cache boundary runs independently in worker processes;
  role-separated tests fetch and materialize identical SHA-256 content without a shared volume.
- [x] **LC4-004 Registry generation** — staged generations remain `activating` until every configured
  runtime role reports readiness for the exact digest; split topology defaults to API + worker.
- [x] **LC4-005 Rollback generation** — the previous healthy generation and cache object are retained;
  the rollback lifecycle atomically restores its registry identity before verified reload.
- [x] **LC4-006 Mutable storage** — production split roles now refuse local-only plugin storage;
  S3-compatible storage supports static credentials or workload identity and dual-write cutover.
- [x] **LC4-007 Recovery archive** — immutable cache objects are never removed with a plugin version,
  withdrawn marketplace artifacts remain addressable, and recovery sets archive the cache with the
  registry, plugin files, grants and mutable data.

### LC-4B Contracts and consistency

- [x] **LC4-008 Parameterized routes** — safe decoded parameters, bounded segments, unique names and
  ambiguous-shape refusal are enforced within each plugin namespace.
- [x] **LC4-009 Typed schemas** — routes may declare a versioned request/response contract and stable
  error catalog; malformed requests, responses and undeclared errors fail closed.
- [x] **LC4-010 Outbox** — the SDK exposes event publication inside the same PostgreSQL transaction as
  namespaced business writes, with publisher-owned names, versions, payload bounds and idempotency.
- [x] **LC4-011 Consumer reliability** — workers claim with `SKIP LOCKED`, recover expired leases,
  process once per consumer, preserve subject ordering, retry exponentially and dead-letter visibly.
- [x] **LC4-012 Read models** — plugins publish bounded versioned records and consumers query the
  host-owned read-model contract instead of another plugin's tables.
- [x] **LC4-013 Dependency lifecycle** — required dependencies gate activation and cannot be disabled
  under an active dependent; optional dependencies expose availability for explicit degraded mode.
- [x] **LC4-014 Resource quotas** — request, SQL, concurrent job, total/per-file storage, notification
  and realtime limits now apply at host-owned capability boundaries.
- [x] **LC4-015 Safe disable** — disable rejects new leases, waits for bounded in-flight job drain,
  runs cleanup/deactivation, then unregisters routes, consumers, navigation, pages and other extensions.

Acceptance:

- [x] API and worker contract tests cover independent cache loss, digest parity, staged version skew,
  role readiness and rollback; hosted restart/scale proof remains bundled with LC4-001's live S3 drill.
- [x] Duplicate/delayed delivery is idempotent per consumer, subject-key ordering is explicit, and
  retry/dead-letter behavior has deterministic tests.
- [x] Cross-plugin SQL remains rejected by the namespace guard; composition uses read-model contracts.

Evidence: `docs/acceptance/lean-core/lc4-runtime-contracts.md`

## Gate LC-5 — Migration and certification toolkit

- [x] **LC5-001 Official template** — the CLI scaffold now produces a validated SDK 1.1 manifest,
  backend lifecycle, declarative frontend, checksummed namespaced migration, English/Khmer
  translations, changelog and permission/data-model/testing documentation.
- [x] **LC5-002 Package CLI** — first-class init, validate, SDK-harness test, deterministic signed
  pack, checksum-safe archive inspection and authenticated repository publish commands are covered
  by an end-to-end local workflow test.
- [x] **LC5-003 Adoption preflight** — the read-only legacy report now gates source schema state,
  approved schema fingerprint, PostgreSQL 14–18 compatibility and target capacity (2× source plus
  256 MiB headroom); initial adoption refuses all mutation when any check fails.
- [x] **LC5-004 Dry run** — `db:legacy:dry-run` performs only read-only schema and owner checks,
  emits the ordered migration plan plus row/relationship/hash reconciliation scope, and returns a
  failing status for blockers before any backup directory, journal or database write is created.
- [x] **LC5-005 Journaled backfill** — atomic, identity-bound journals checkpoint idempotent chunks
  and expose cursor/processed-row progress; tests kill and resume at every chunk checkpoint.
- [x] **LC5-006 Maintenance coordination** — exclusive, operation-owned maintenance locks prevent
  competing cutovers and always release on completion or failure.
- [x] **LC5-007 Reconciliation** — the toolkit compares rows, relationships, decimal amounts,
  timestamps and file digests and fails the certification decision on any mismatch.
- [x] **LC5-008 Rollback** — rollback restores legacy route ownership and disables the plugin while
  retaining both source and plugin datasets for recovery or retry.
- [x] **LC5-009 Compatibility proxy** — a machine-checked registry requires every proxy to be thin,
  Prisma-free, plugin-owned and assigned an explicit core removal version.
- [x] **LC5-010 Lifecycle suite** — 38 tests certify service lifecycle, runtime cleanup, rollout and
  the independently packed announcements reference plugin.
- [x] **LC5-011 Recovery suite** — 12 tests cover portable checksummed database/plugin recovery and
  reconciliation; a boundary test pins database registry/grants, plugin code and mutable files.
- [x] **LC5-012 Security suite** — 25 tests cover signatures/packages, SQL namespaces,
  permissions/capabilities and hostile traversal, bomb, symlink, SSRF and secret-access fixtures.
- [x] **LC5-013 Evidence generator** — `certify:plugin:migration` runs all suites without shell
  dependence and writes a hashed, fail-closed JSON certification report with counts and diagnostics.

Acceptance:

- [x] Kill the migration at every checkpoint; retry or rollback always produces one authoritative
  reconciled dataset.
- [x] The independently packaged reference plugin passes the complete suite.

Evidence: `docs/acceptance/lean-core/lc5-migration-certification-toolkit.md`

## Gate MP-1 — First production extraction

Recommended first plugin: **`wattanam.document-designer`**.

- [x] **MP1-001 Inventory** — Card Templates, card pages, certificates, QR codes, LaTeX tool,
  supporting APIs/models/files and print views inventoried in
  `docs/acceptance/mp1-document-designer-ownership-2026-09-15.md`.
- [x] **MP1-002 Scope decision** — LaTeX is excluded as a separate optional Tool plugin;
  rationale recorded in the ownership inventory.
- [x] **MP1-003 Package** — `plugins/wattanam.document-designer` created from the standard
  template with a namespaced migration, four permission IDs, backend route contract and UI v2
  descriptor; CLI check and five focused route tests pass. This is not a complete feature cutover.
- [~] **MP1-004 Data** — namespaced create-table migration, read-only preflight and
  backup-bound zero-write dry-run plus journaled copy/reconciliation are implemented with local
  crash/retry tests; explicit compatibility routing defaults to legacy and supports a
  backup-bound non-destructive rollback drill that passes locally
  ([rollback evidence](../acceptance/mp1-document-designer-rollback-drill-2026-09-25.md)). A real PostgreSQL 16
  backup/isolated-restore/adoption/rollback rehearsal passed on 2026-09-26; the required rehearsal
  now additionally verifies scoped-asset conversion and generation from the adopted row, but that
  enhanced revision still needs its first PostgreSQL/CI execution. Hosted adoption and live rollback
  remain open ([rehearsal evidence](../acceptance/lean-core/wordpress-style-existing-school-document-designer-rehearsal-2026-09-26.md),
  [preflight evidence](../acceptance/mp1-document-designer-adoption-preflight-2026-09-15.md)).
- [~] **MP1-005 UI** — list/detail remain declarative; a separate permission-gated edit page now
  submits validated JSON-object designs through the plugin route. Actual descriptor/schema tests
  pass. The detail page now submits bounded generation input and consumes the
  mutation result through the host print/CSV/PDF renderer. Discoverable editor navigation, rich
  version 0.1.3 now produces a bounded positioned document preview and live visual editor through
  safe host-owned components; table rows link directly to the editor. Bounded pointer drag/resize
  behavior and host-rendered shape creation pass all 12 phone/tablet/desktop browser scenarios
  with a clean zero exit; a machine-readable reporter makes the result independent of residual
  Windows browser handles
  ([evidence](../acceptance/mp1-document-designer-drag-resize-2026-09-25.md)). Hosted pixel/output parity certification
  remain open ([editor evidence](../acceptance/mp1-document-designer-json-editor-2026-09-16.md),
  [render-model evidence](../acceptance/mp1-document-designer-render-model-2026-09-23.md)).
- [~] **MP1-006 Permissions** — the manifest/runtime separates view, edit, generate and print;
  adoption idempotently preserves authenticated legacy active-design reads and administrator
  mutation access. Version 0.1.2 adds a bounded `generate` route that only accepts records already
  authorized by the caller and performs no cross-domain lookup. Its result is connected to the
  host print/CSV surface; version 0.1.3 adds a normalized positioned document model and safe
  print/Save-as-PDF renderer. Academic class-roster row scope is locally proven end to end: an
  unassigned teacher is denied and the renderer performs no Academic lookup. Version 0.1.4 adds a
  bounded staff source using Directory identity plus Human Resources' privacy-minimized title
  projection ([evidence](../acceptance/mp1-document-designer-staff-source-2026-09-25.md)). Hosted
  authorization, browser staff-card generation and pixel/output parity tests remain open.
- [~] **MP1-007 Storage** — version 0.1.1 adds host-quota-enforced scoped asset upload/list/read/delete
  routes with generated IDs, canonical base64 and a bounded MIME allowlist. Version 0.1.2 connects
  safe image types to the host upload/preview/download/delete UI. The legacy preflight now
  inventories embedded PNG/JPEG/WebP assets by content hash, deduplicates references, and blocks
  non-portable, malformed, unsupported, or over-quota payloads before writes; portable bytes are
  covered by exact design reconciliation. A separate backup/journal-bound, idempotent conversion
  copies them into plugin-scoped storage under deterministic IDs while retaining legacy sources
  and enforcing optimistic row concurrency. The required restored-backup job now fails unless the
  converted asset appears with unchanged geometry/style in a generated plugin render model; its
  first enhanced PostgreSQL/CI run and hosted certification remain open.
- [~] **MP1 legacy output parity** — Document Designer 0.1.7 projects bounded legacy text,
  converted images, QR placeholders and solid rectangle/circle/line shapes into the safe schema-v2
  render model rather than silently returning an empty document. The host editor and print preview
  render shapes and record-bound person photos without plugin HTML/script. Photo values are limited
  to bounded canonical embedded raster data or same-origin paths; remote URLs and unsafe schemes
  fail server-side. Validated linear/radial gradients with 2..8 ordered color stops and solid,
  dashed or dotted borders render through host CSS; malformed tokens and unconverted images fail
  closed. Page frames, layer order, allowlisted typography, image opacity/radius and QR/photo
  borders now pass a deterministic local preservation contract and the production host build/browser
  suite ([evidence](../acceptance/mp1-document-designer-visual-parity-contract-2026-09-28.md)). Hosted
  restored-school pixel comparison remains required.
- [~] **MP1-008 Fresh certification** — the actual Document Designer 0.1.7 source now packs into a
  signed `.wtp`, passes the production verifier, and traverses the clean-core marketplace download,
  consent, release-key persistence, install and activation pipeline locally
  ([evidence](../acceptance/mp1-document-designer-clean-core-marketplace-install-2026-09-28.md)).
  A newly provisioned hosted school install/restart/UI proof remains required.
- [~] **MP1-009 Legacy certification** — the 2026-09-26 real PostgreSQL restored-backup rehearsal
  proved exact adoption and non-destructive rollback. The required job now also generates the
  adopted template and compares page, asset, geometry and style semantics
  ([evidence](../acceptance/lean-core/wordpress-style-existing-school-document-designer-rehearsal-2026-09-26.md));
  its first enhanced green run and hosted screenshot/pixel comparison remain open.
- [~] **MP1-010 Lifecycle/recovery** — local reactivation preserves template data and compatibility
  routing has an explicit legacy rollback. The actual signed 0.1.6 archive now passes production
  install/activate/deactivate/remove/reinstall/reactivate with plugin-owned template data preserved
  ([evidence](../acceptance/mp1-document-designer-clean-core-marketplace-install-2026-09-28.md));
  hosted restart/update/rollback and clean backup/restore remain open.
- [ ] **MP1-011 Pilot** — controlled school rollout with rollback evidence.
- [ ] **MP1-012 Cleanup** — remove legacy ownership only after rollback window approval.

Gate: the first complete business plugin operates without rebuilding core.

## Gate MP-2 — Academic Management foundation

- [~] **MP2-001 Split identity** — account reads, parent-link writes and user-delete academic detach
  now cross an explicit provider boundary; delete uses a deterministic idempotency key and the
  legacy adapter owns its transaction. Identity list/detail/search contain no academic relation
  fallback, department assignment/clearing uses a provider command, and login/refresh always use
  core-only projections. Parent assignment/clearing also has no direct fallback. Department reads
  now dispatch to a self-or-administrator scoped owner route only while Academic is active and fail
  closed in plugin mode; the core directory provider's private membership SQL was removed. The
  Department assignment, guardian assignment, and Academic identity detach now also have explicit
  plugin-owner modes using administrator-only idempotent owner commands; lifecycle unload fails
  closed, conflicting shadow settings are rejected, and plugin detach touches no Attendance or
  Finance tables. When both Department and Student Profile read owners are `plugin`, auth profile
  enrichment now uses a bounded owner-side batch contract with exact response coverage instead of
  core cross-schema SQL. Core-only password validation, ADMIN registration/session issuance,
  list/search/detail/update, and deletion now pass without an Academic provider or any academic
  Prisma client, closing the gate's core-identity-works-without-Academic assertion. Mixed migration
  modes, remaining mixed User concerns, and hosted cutover evidence still prevent completion;
  Session Configuration consumes the runtime-bound department contract
  ([runtime-isolation evidence](../acceptance/mp2-academic-runtime-sql-isolation-2026-09-23.md)).
- [~] **MP2-002 Academic schema** — ownership manifests identify the target models and Departments
  CRUD is provider-backed with atomic legacy deletion. Academic Management 0.1.7 now provides
  namespaced list/detail/create/update/delete routes; the explicit plugin owner switch dispatches
  every compatibility operation to those routes, and delete atomically clears plugin memberships
  with a deterministic command key. Legacy-default rollback remains intact. Additive namespaced Department/membership,
  Enrollment, Class, Admissions and Student profile migrations now exist. Academic's earlier
  StudyYear table is retained only as rollback data; Attendance Manager is the sole active owner.
  Student
  profile preflight and journaled adoption pass locally with exact count/hash reconciliation;
  explicit plugin read routing and atomic parity-checked shadow writes pass focused tests. Hosted
  route certification and final removal of legacy schema remain open. Academic Management 0.1.10
  now owns canonical teaching-subject identities through an immutable namespaced migration,
  administrator-only mutations, a bounded active-subject contract, and declarative list/create/edit
  management UI that supports both UUID and adopted legacy identifiers;
  deterministic backup-bound legacy-value adoption, exact reconciliation, guarded rollback, and
  unified cutover-gate enforcement pass locally. Timetable retains only schedule-local mappings.
  Class parent-directory, single/bounded-batch roster, available-student reads and bounded CSV
  import now dispatch to owner-side scoped routes in plugin mode. CSV identity creation/update uses
  journaled capability-gated core commands while profile/enrollment writes remain plugin-owned
  ([student-profile evidence](../acceptance/mp2-student-profile-schema-2026-09-23.md),
  [department evidence](../acceptance/mp2-academic-department-ownership-2026-09-25.md),
  [subject evidence](../acceptance/mp2-academic-subject-ownership-2026-09-25.md),
  [compatibility-read evidence](../acceptance/mp2-class-compatibility-reads-2026-09-25.md),
  [CSV import evidence](../acceptance/mp2-academic-csv-roster-import-2026-09-25.md)).
- [~] **MP2-003 Admissions** — compatibility seam, fail-closed legacy writes, namespaced
  migrations, deterministic preflight, journaled adopt/dry-run toolkit, rollback drill,
  cutover-readiness parity, and certified plugin-owned submit/resolve/settings/fields write
  handlers are implemented and locally tested. Approved registration now creates only the stable
  core User through the replica-serialized, journaled and audited `accounts.student.create`
  capability; Academic atomically owns the Student Profile, Enrollment Interval, registration link
  and durable v2 event, and the legacy v1 Student subscriber is no longer active. Full
  production-shaped cutover evidence remains open
  ([account-boundary evidence](../acceptance/mp2-admissions-core-account-boundary-2026-09-25.md)).
- [x] **MP2-004 Roster contracts** — class audience, class membership, class lookup and department
  membership have provider-backed consumers. Class list/detail, roster reads and roster mutations
  now enforce assigned teacher/class-admin scope; Class structure mutations and all private
  Admissions administration additionally require an administrator principal and fail before
  database access even if a route permission is broadly granted. The plugin now publishes
  versioned historical class-roster and enrollment-at-date routes from its own interval tables,
  validates exact ISO dates, detects overlap/missing-profile corruption, and applies originating
  domain row scope (11/11 reference tests; 17/17 with dependent fixtures;
  [authorization evidence](../acceptance/mp2-academic-authorization-boundary-2026-09-25.md)).
  Core roster/enrollment, audience, reverse membership, and lookup reads now bind to owner routes
  only while Academic is active, reject
  invalid responses, unbind on deactivation, and fail closed rather than falling back to private
  table SQL in plugin-read mode. The core directory provider no longer contains Academic Class,
  Student Profile, or Enrollment Interval SQL (35/35 focused provider/Directory/runtime tests;
  [contract evidence](../acceptance/mp2-plugin-roster-contract-2026-09-25.md)).
- [x] **MP2-005 Event contracts** — Academic-owned Class and student class-membership writes publish
  versioned lifecycle events both after mutation and transactionally through the durable outbox,
  using deterministic idempotency keys; the core subscriber and reference-plugin tests pass.
  Study Year lifecycle events moved to its canonical Attendance Manager owner and are verified
  separately ([MP2 reconciliation](../acceptance/mp2-master-reconciliation-2026-09-22.md),
  [MP3 ownership evidence](../acceptance/mp3-study-year-ownership-contract-2026-09-23.md)).
- [~] **MP2-006 UI** — declarative plugin UI now covers departments, teaching-subject
  list/create/edit, classes,
  class student roster, teacher directory, and registration list/detail/resolve. Student roster
  add/edit/remove and orphan cleanup are now locally wired through validated declarative pages;
  mutations enforce class-and-student scope. Hosted page-host render certification remains open.
- [~] **MP2-007 Migration** — read-only department/membership preflight has deterministic
  fingerprinting, orphan detection and target readiness checks, and its additive target migrations
  exist. Backup-bound dry-run and two-phase resumable copy/reconciliation pass locally. Department
  reads have legacy-default/plugin-explicit routing; plugin-mode writes fail closed until certified
  consistency. Student profiles now also have deterministic preflight plus backup-bound, resumable,
  idempotent adoption with exact reconciliation, and a fail-closed non-destructive routing rollback
  drill. A legacy-default/plugin-explicit read seam and atomic shadow-write mode are locally tested.
  The unified read-only cutover gate now requires Student Profile count/hash parity and its
  backup-bound reconciled journal. Restored-backup and hosted cutover/rollback proofs plus the
  remaining academic entities are open. Canonical Subjects now have the same deterministic
  backup-bound preflight/adopt/rollback and unified parity/journal gate locally. A combined
  2026-09-25 local recheck passes all Student
  Profile, Class, and Admissions preflight/adopt/rollback suites plus the unified cutover gate
  (30/30; [evidence](../acceptance/mp2-local-migration-toolkit-recheck-2026-09-25.md)).
- [x] **MP2-008 Dependent fixtures** — Attendance, Timetable, Examination, Learning and Finance
  fixture consumers pass against only the roster/enrollment provider contract, including malformed
  date rejection, without direct Student/Class access
  ([reconciliation evidence](../acceptance/mp2-master-reconciliation-2026-09-22.md)).
- [ ] **MP2-009 Certification and pilot** — full lifecycle, recovery and production-shaped adoption.

Gate: core-only identity administration works with Academic Management absent.

## Gate MP-3 — Attendance vertical plugin

Do not start this gate until LC-3, LC-4, LC-5 and MP-2 are complete.

- [x] **MP3-001 Inventory** — attendance, session config, holidays, aliases, all scanners, reports,
  print pages, notifications, jobs, gateways and mobile flows are exhaustively assigned, including
  the ADR-mandated staff/lesson/course exclusions
  ([inventory](./mp3-attendance-surface-inventory.md)).
- [x] **MP3-002 Ownership split** — Attendance Manager 0.1.3 accepts only student school-day
  attendance; staff is assigned to Human Resources, lesson attendance to Timetable and
  course-session attendance to Learning. An additive database constraint rejects future boundary
  violations without deleting historical rows
  ([evidence](../acceptance/mp3-attendance-ownership-boundary-2026-09-25.md)).
- [x] **MP3-003 Data schema** — Attendance Manager 0.1.7 declares records, sessions,
  corrections, idempotent scans, holidays, aliases, alerts and historical snapshot fields through
  immutable migrations. Manifest/checksum/source tests, guarded PostgreSQL runtime certification,
  and a complete six-dataset restored-backup adoption/rollback rehearsal pass
  ([local evidence](../acceptance/mp3-attendance-data-foundation-2026-09-25.md),
  [restored-school evidence](../acceptance/lean-core/wordpress-style-existing-school-attendance-manager-rehearsal-2026-09-28.md)).
- [x] **MP3-004 Historical snapshots** — every accepted write snapshots student name/number, class
  name and Study Year label; conflict updates retain the original display state
  ([evidence](../acceptance/mp3-attendance-academic-snapshot-contract-2026-09-25.md)).
- [x] **MP3-005 Academic integration** — Attendance consumes the dated
  `wattanam.academic-management.roster@1.0.0` directory contract, fails closed for non-membership,
  and has no cross-plugin SQL
  ([evidence](../acceptance/mp3-attendance-academic-snapshot-contract-2026-09-25.md)).
- [~] **MP3-006 Unified command** — the plugin now has one transactionally idempotent camera/QR/
  card/USB command with advisory locking, hashed-code ledger and once-only durable/transient events;
  legacy web/mobile/offline callers and real-PostgreSQL concurrency proof remain
  ([local evidence](../acceptance/mp3-unified-scan-command-2026-09-25.md)).
- [x] **MP3-007 Device security** — permission plus operator-role authorization, configurable IANA
  timezone, server-selected active sessions, holiday rejection, bounded offline/future clocks and
  transactionally idempotent duplicates are enforced before mutation
  ([evidence](../acceptance/mp3-device-security-policy-2026-09-25.md)).
- [x] **MP3-008 Permissions** — view, scan, mark, correct, report, print, configure and device
  management are declared and enforced by their respective routes/UI; deprecated coarse IDs have no
  active route ([evidence](../acceptance/mp3-granular-permissions-2026-09-25.md)).
- [x] **MP3-009 Row scope** — administrators, scanner operators, assigned teachers/class admins,
  students and parents are filtered through one Academic-contract-backed scope policy across writes,
  corrections, reads and reports ([evidence](../acceptance/mp3-attendance-row-scope-2026-09-25.md)).
- [~] **MP3-010 UI** — declarative admin/teacher attendance, scanner, correction, Study Year,
  settings, identifier and holiday flows are implemented; scanner submissions include required
  class/session context plus retry-stable idempotency. Schema/source tests and the production
  frontend build pass. Hosted role-based browser proof remains
  ([local evidence](../acceptance/mp3-attendance-declarative-ui-2026-09-25.md)).
- [~] **MP3-011 Reports** — shared validated, row-scoped projections now cover status summary,
  daily grid, student detail, monthly trend, class progress, detailed print data and UTF-8 CSV;
  declarative class/student/date/session/status filters and browser print/CSV/PDF use immutable
  snapshots. Hosted legacy-parity proof remains
  ([local evidence](../acceptance/mp3-attendance-reports-2026-09-25.md)).
- [x] **MP3-012 Realtime/jobs** — the absence evaluator uses core scheduling, distributed locking,
  non-overlap, suspension checks and disable/drain teardown; stable alert keys plus the immutable
  per-recipient/channel delivery ledger make retries selective, while notification and realtime
  delivery remain core-quota/audit/namespacing controlled
  ([evidence](../acceptance/mp3-attendance-alert-lifecycle-2026-09-25.md)).
- [~] **MP3-013 Data adoption** — the read-only six-dataset preflight and additive lossless target
  schema, backup-bound multi-dataset journal, resumable idempotent copier, exact canonical
  reconciliation and non-destructive rollback drill are complete locally. A real-PostgreSQL run
  against a verified school-bound backup remains
  ([local evidence](../acceptance/mp3-attendance-adoption-preflight-2026-09-25.md)).
- [ ] **MP3-014 Real-device certification** — camera, QR/card and USB scanners.
- [ ] **MP3-015 Full lifecycle/recovery** — clean install through production pilot.

Gate: the complete scan-to-report-to-print workflow belongs to the installed plugin; no attendance
business implementation or compiled attendance page remains in lean core.

## Gates MP-4 through MP-9 — Remaining plugins

Apply the same per-plugin gate in the migration plan.

All 13 currently discovered official plugins now share a data-driven signed-package lifecycle gate:
the real sources are packed and verified, dependencies are validated, then every package is
installed/activated in dependency order, deactivated/removed in reverse order, and
rolled to separately signed preceding patch versions, updated forward, then removed and
reinstalled/reactivated with durable-data sentinels preserved
([evidence](../acceptance/lean-core/wordpress-style-official-plugin-catalog-lifecycle-2026-09-28.md)).
They also pass a fail-closed operational manifest gate for runtime health, classified data,
database/file backup participation, required restore verification, preserved uninstall data,
central Marketplace pricing, and support/privacy metadata
([evidence](../acceptance/lean-core/wordpress-style-official-plugin-operational-contract-2026-09-28.md)).
Portable restore execution and hosted operational review remain independent requirements.
Recovery-set v2 now consumes those declarations, binds exact manifest digests, preserves required
empty file namespaces, verifies contracts before touching the database/live directories, and
surfaces historical-manifest exceptions without breaking existing-school backups
([evidence](../acceptance/lean-core/wordpress-style-plugin-recovery-contract-v2-2026-09-28.md)).
The reusable portable-backup gate remains open until its strict zero-exception PostgreSQL,
self-hosted and Railway restore executions pass.
This closes the local package/registry portion only; database, hosted, device, review and pilot
requirements below remain independent.

- [~] **MP4 Timetable** — scheduling, classrooms, subjects, teachers, reports and print. Local
  extraction, adoption tooling and signed package/registry lifecycle are implemented;
  real-PostgreSQL, hosted parity and complete lifecycle certification remain open.
- [~] **MP5 Examination** — exams, questions, attempts, scoring, gradebook and reports. Local rich
  workflows, adoption tooling and signed package/registry lifecycle are implemented;
  real-PostgreSQL, hosted parity and complete lifecycle certification remain open.
- [~] **MP6 Learning** — courses, lessons, assignments, quizzes, rich interactive questions,
  engagement and course attendance are implemented locally in 0.1.2; adoption tooling, rich UI,
  and signed package/registry lifecycle are present; real-PostgreSQL and complete lifecycle
  certification remain open.
- [~] **MP7 Transportation and Communication** — Transportation 0.1.1 has a local five-table,
  permission-gated CRUD/tracking foundation, dated-roster parent model and guarded adoption tooling.
  Communication 0.1.1 has isolated Message/Post/outbox storage, dated-roster safeguarding,
  retryable delivery, host-rendered authoring and guarded adoption/rollback tooling while
  Announcements remains standalone. Both require restored-backup/hosted certification; Communication
  additionally requires rich composition, outbox delivery and privacy review. Both pass the
  catalog-wide signed package/registry lifecycle gate.
- [~] **MP8 Finance and Human Resources** — Finance 0.1.0 has an isolated minor-unit fee/receipt
  foundation with transactional immutable receipts plus a privacy-safe, exact-only read preflight
  for its three legacy datasets passing 7 tests; it blocks rather than rounds unrepresentable money
  ([evidence](../acceptance/mp8-finance-adoption-preflight-2026-09-25.md)); its guarded backup-bound
  adoption, exact reconciliation and metadata-only rollback suite passes 4 more tests. Human
  Resources 0.1.0 has
  normalized employee, CV, minor-unit payroll and staff-attendance storage with three-party payroll
  segregation plus an exact-only six-dataset read preflight passing 7 tests that blocks invalid net
  salary/paid provenance and records the missing legacy approver identity
  ([evidence](../acceptance/mp8-human-resources-adoption-preflight-2026-09-25.md)); its backup-bound
  resumable adoption, exact six-dataset reconciliation and metadata-only rollback suite passes 4
  more tests. Restored-backup execution for both plugins, row scope, hosted proof and specialist
  approvals remain open; both pass the catalog-wide signed package/registry lifecycle gate.
- [~] **MP9 Parent Portal and Reporting** — Parent Portal 0.1.1 has an isolated parent-link workflow,
  dated-roster child scope, optional read-model composition and audited idempotent parent/guardian
  core commands passing 17 focused backend tests plus 8 SDK tests
  ([evidence](../acceptance/mp9-parent-portal-foundation-2026-09-25.md)). Key-scoped core read-model
  retrieval plus privacy-minimized Attendance, Finance, Examination, Transportation and
  Communication projections are implemented locally. Its guarded adoption/reconciliation/rollback
  toolkit also passes locally. Reporting 0.1.1 now composes those five optional student-keyed
  projections behind a dated Academic roster and administrator scope, with a schema-v2 filtered
  table and host-owned print/CSV/PDF output, plus dated staff attendance from an actor-free Human
  Resources v1 projection; the focused HR/Reporting source/behavior suites pass 14 tests
  ([worksheet](./reporting-plugin-extraction.md),
  [evidence](../acceptance/mp9-reporting-foundation-2026-09-25.md)). Hosted PostgreSQL, lifecycle,
  restored-backup parity, privacy/accessibility review and legacy cutover remain open for MP9;
  both packages pass the catalog-wide signed registry lifecycle gate.

For every plugin:

- [ ] Complete ownership worksheet.
- [ ] Certify marketplace-only fresh installation.
- [ ] Certify permissions and row scope.
- [ ] Certify disable/update/remove/reinstall.
- [ ] Certify legacy adoption and rollback.
- [ ] Certify portable backup/restore.
- [ ] Complete security, privacy, accessibility and operational review.
- [ ] Pilot before broad rollout.
- [ ] Remove legacy code only after the rollback window.

## Final gate LC-F — Make lean core the production default

- [ ] **LCF-001 New install default** — set new installations to `core` only after every preceding
  core gate passes.
- [~] **LCF-002 Starter bundles** — governed Marketplace bundle metadata now resolves independent
  compatible plugin releases; paid members use one normal multi-line order, and installation uses
  the existing per-plugin signature, consent, entitlement and lifecycle path with safe retries.
  Platform Admin now supplies permission-scoped, reasoned, transactionally audited bundle
  management. Required CI now includes both an isolated Marketplace lifecycle drill and a
  two-database school drill covering real signed artifacts, paid settlement, interruption-safe
  retry, removal and reinstall. Their first successful execution plus hosted browser
  commerce/install certification remain
  ([evidence](../acceptance/lean-core/wordpress-style-starter-bundles-2026-09-28.md)).
- [x] **LCF-003 No local upload** — direct customer package inspection/install endpoints are absent;
  customer acquisition is restricted to the role-guarded marketplace catalog/install route, while
  signed package ingestion remains confined to authenticated central publisher/operator routes.
  This boundary is enforced in PR CI
  ([evidence](../acceptance/lean-core/wordpress-style-marketplace-only-installation-2026-09-25.md)).
- [~] **LCF-004 No optional schema** — a fail-closed verifier now derives the complete canonical
  table allowlist from core migrations and rejects any extra or missing table after the fresh-core
  CI installation; local verifier and workflow-contract tests pass 7/7. Closure awaits the first
  updated PostgreSQL smoke run
  ([evidence](../acceptance/lean-core/wordpress-style-no-optional-schema-2026-09-28.md)).
- [x] **LCF-005 No optional UI** — freshly rebuilt physical backend and frontend core artifacts pass
  the strict compiled-artifact gate with zero optional module/page violations; the frontend emits
  only the 27 approved core/marketplace/generic-host routes, and the build/gate is required in PR
  CI. Docker and hosted runtime certification remain separately tracked by LCF-008/009
  ([evidence](../acceptance/lean-core/wordpress-style-physical-core-artifacts-2026-09-25.md)).
- [x] **LCF-006 No optional runtime** — the artifact verifier now derives every decorated optional
  provider/controller/job/processor/gateway from the ownership registry and rejects its symbol in
  the physical core bundle; PR CI then boots that exact bundle in the isolated deployment smoke
  ([evidence](../acceptance/lean-core/wordpress-style-no-optional-runtime-2026-09-28.md)).
- [~] **LCF-007 Upgrade path** — the [existing-school upgrade runbook](../operations/existing-school-lean-core-upgrade-runbook.md) provides the migration/exception process, command matrix, staged ownership cutover and non-destructive rollback rules; every supported existing school still needs its own restored-backup rehearsal and accepted evidence before this item can close.
  exception.
- [ ] **LCF-008 Hosted proof** — clean Railway school installation, marketplace link, plugin install,
  disable, update, restore and core upgrade pass.
- [ ] **LCF-009 Docker proof** — equivalent self-hosted drill passes.
- [ ] **LCF-010 Release approval** — security, privacy, legal, finance, support and operations approve.

Evidence: `docs/acceptance/lean-core/lcf-production-default.md`

## Current completion queue

The architecture is not ready for the final production-default gate. Continue in this dependency
order; a later gate must not be used to bypass an earlier gate's acceptance evidence:

1. Complete the production-shaped S3 immutability/restart/scale drill for `LC4-001`.
2. Complete MP-1 Document Designer, including a controlled-school pilot and rollback window.
3. Complete MP-2 Academic Management before starting MP-3 Attendance.
4. Complete MP-3, then migrate MP-4 through MP-9 using the same certification gate.
5. Run LC-F hosted and Docker proofs and obtain security, privacy, legal, finance, support and
   operations approval before changing new installations from `legacy-full` to `core`.

The 48 unfinished lines (25 open and 23 partial) include gate items, acceptance statements and the nine reusable per-plugin
certification requirements. External live drills, real-device checks, pilots and organizational
approvals must remain open until their durable evidence exists; local unit tests cannot close them.
