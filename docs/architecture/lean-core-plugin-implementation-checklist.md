# Lean Core and Module-to-Plugin Implementation Checklist

Status: **LC-0 and LC-1 complete; LC-2 is next**
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
- [ ] **LC3-014 Accessibility** — keyboard, screen-reader, focus and contrast tests.
- [ ] **LC3-015 Responsive UI** — phone, tablet and desktop certification.
- [x] **LC3-016 Permission parity** — the same persisted role grant filters v2 navigation and page
  discovery and remains the authoritative audited check at API dispatch; denied deep links fail.

Acceptance:

- [ ] A signed sample plugin adds a real list/form/detail/print workflow.
- [ ] Installing it requires no core frontend rebuild or redeployment.
- [ ] Disabling it removes its navigation and blocks direct deep links.
- [ ] Malformed and hostile descriptors fail closed.

Evidence: `docs/acceptance/lean-core/lc3-plugin-ui-v2.md`

## Gate LC-4 — Runtime, artifacts and cross-plugin contracts

### LC-4A Artifact distribution

- [~] **LC4-001 Artifact origin** — SHA-256-addressed local/S3 providers, provider-boundary digest
  checks, create-only S3 writes and streaming reads are implemented and tested; a production-shaped
  S3 live immutability drill remains.
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

- [ ] **LC5-001 Official template** — manifest, backend, frontend, migrations, translations and docs.
- [ ] **LC5-002 Package CLI** — init, validate, test, pack, inspect and publish workflow.
- [ ] **LC5-003 Adoption preflight** — source schema/version and capacity checks.
- [ ] **LC5-004 Dry run** — zero-write migration plan and reconciliation preview.
- [ ] **LC5-005 Journaled backfill** — resumable, idempotent chunks with visible progress.
- [ ] **LC5-006 Maintenance coordination** — prevent inconsistent writes during cutover.
- [ ] **LC5-007 Reconciliation** — rows, relationships, amounts, timestamps and files.
- [ ] **LC5-008 Rollback** — restore routing/registry without deleting either dataset.
- [ ] **LC5-009 Compatibility proxy** — thin, Prisma-free, owned and removal-versioned.
- [ ] **LC5-010 Lifecycle suite** — install, activate, disable, update, remove and reinstall.
- [ ] **LC5-011 Recovery suite** — portable backup/restore including artifacts, grants and files.
- [ ] **LC5-012 Security suite** — package, SQL, permissions, supply chain and hostile fixtures.
- [ ] **LC5-013 Evidence generator** — write reproducible certification output to acceptance docs.

Acceptance:

- [ ] Kill the migration at every checkpoint; retry or rollback always produces one authoritative
  reconciled dataset.
- [ ] The independently packaged reference plugin passes the complete suite.

Evidence: `docs/acceptance/lean-core/lc5-migration-certification-toolkit.md`

## Gate MP-1 — First production extraction

Recommended first plugin: **`wattanam.document-designer`**.

- [ ] **MP1-001 Inventory** — trace Card Templates, card pages, certificates, QR codes, LaTeX tool,
  supporting APIs/models/files, reports and print views.
- [ ] **MP1-002 Scope decision** — decide whether LaTeX is included or a separate Tool plugin.
- [ ] **MP1-003 Package** — create the official plugin using the standard template.
- [ ] **MP1-004 Data** — create namespaced migrations and adoption scripts.
- [ ] **MP1-005 UI** — move listing, editing, preview, bulk generation and print workflows.
- [ ] **MP1-006 Permissions** — separate view, edit, generate and print permissions.
- [ ] **MP1-007 Storage** — migrate templates/assets through scoped shared storage.
- [ ] **MP1-008 Fresh certification** — install from marketplace on clean core.
- [ ] **MP1-009 Legacy certification** — adopt existing data and compare rendered output.
- [ ] **MP1-010 Lifecycle/recovery** — disable/update/remove/reinstall/backup/restore.
- [ ] **MP1-011 Pilot** — controlled school rollout with rollback evidence.
- [ ] **MP1-012 Cleanup** — remove legacy ownership only after rollback window approval.

Gate: the first complete business plugin operates without rebuilding core.

## Gate MP-2 — Academic Management foundation

- [ ] **MP2-001 Split identity** — separate account/person from student, teacher and employee domain
  profiles.
- [ ] **MP2-002 Academic schema** — own Student, Class, Enrollment, StudyYear, Department and Subject.
- [ ] **MP2-003 Admissions** — move class registration/intake and configurable fields.
- [ ] **MP2-004 Roster contracts** — lookup, enrollment-at-date and authorized audience APIs.
- [ ] **MP2-005 Event contracts** — student/class/enrollment lifecycle with outbox delivery.
- [ ] **MP2-006 UI** — administrators, teachers, students, classes, years and admissions pages.
- [ ] **MP2-007 Migration** — reconcile identities, profiles, classes and relationships.
- [ ] **MP2-008 Dependent fixtures** — prove Attendance/Timetable/Exam/Learning/Finance can consume
  contracts without database joins.
- [ ] **MP2-009 Certification and pilot** — full lifecycle, recovery and production-shaped adoption.

Gate: core-only identity administration works with Academic Management absent.

## Gate MP-3 — Attendance vertical plugin

Do not start this gate until LC-3, LC-4, LC-5 and MP-2 are complete.

- [ ] **MP3-001 Inventory** — attendance, session config, holidays, aliases, all scanners, reports,
  print pages, notifications, jobs, gateways and mobile flows.
- [ ] **MP3-002 Ownership split** — remove staff, timetable-teacher and course attendance from the
  student school-day attendance boundary according to LC0-012.
- [ ] **MP3-003 Data schema** — records, sessions, corrections, scans, holidays, aliases and alerts.
- [ ] **MP3-004 Historical snapshots** — preserve required student/class/user display values.
- [ ] **MP3-005 Academic integration** — roster/enrollment contracts only; no cross-plugin SQL.
- [ ] **MP3-006 Unified command** — all scan methods use one idempotent server command.
- [ ] **MP3-007 Device security** — authorization, session/timezone, duplicate and clock policies.
- [ ] **MP3-008 Permissions** — view, scan, mark, correct, report, print, configure, manage devices.
- [ ] **MP3-009 Row scope** — teachers/classes/students/parents see only authorized records.
- [ ] **MP3-010 UI** — admin, teacher, scanner, corrections, settings and holidays.
- [ ] **MP3-011 Reports** — administrator/teacher summaries, filters, CSV/PDF and print.
- [ ] **MP3-012 Realtime/jobs** — safe disable, suspension and retry behavior.
- [ ] **MP3-013 Data adoption** — journaled historical migration and total comparison.
- [ ] **MP3-014 Real-device certification** — camera, QR/card and USB scanners.
- [ ] **MP3-015 Full lifecycle/recovery** — clean install through production pilot.

Gate: the complete scan-to-report-to-print workflow belongs to the installed plugin; no attendance
business implementation or compiled attendance page remains in lean core.

## Gates MP-4 through MP-9 — Remaining plugins

Apply the same per-plugin gate in the migration plan.

- [ ] **MP4 Timetable** — scheduling, classrooms, subjects, teachers, reports and print.
- [ ] **MP5 Examination** — exams, questions, attempts, scoring, gradebook and reports.
- [ ] **MP6 Learning** — courses, lessons, assignments, quizzes, H5P and engagement.
- [ ] **MP7 Transportation and Communication** — complete location/realtime and messaging flows.
- [ ] **MP8 Finance and Human Resources** — specialist financial, payroll, privacy and audit review.
- [ ] **MP9 Parent Portal and Reporting** — optional adapters and stable read models only.

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
- [ ] **LCF-002 Starter bundles** — optional bundles are normal marketplace transactions.
- [ ] **LCF-003 No local upload** — direct customer package inspection/install endpoints remain absent.
- [ ] **LCF-004 No optional schema** — clean core database contains no business-plugin tables.
- [ ] **LCF-005 No optional UI** — core build contains no compiled business pages or static links.
- [ ] **LCF-006 No optional runtime** — core starts no business jobs, gateways or providers.
- [ ] **LCF-007 Upgrade path** — every supported existing school has a migration path or documented
  exception.
- [ ] **LCF-008 Hosted proof** — clean Railway school installation, marketplace link, plugin install,
  disable, update, restore and core upgrade pass.
- [ ] **LCF-009 Docker proof** — equivalent self-hosted drill passes.
- [ ] **LCF-010 Release approval** — security, privacy, legal, finance, support and operations approve.

Evidence: `docs/acceptance/lean-core/lcf-production-default.md`

## Immediate coding queue

Only start these tasks after LC-0 approval:

1. [x] Implement the reproducible inventory generator (`LC1-001` through `LC1-014`).
2. [x] Add and validate `WATTANAM_DISTRIBUTION` (`LC2-001`, `LC2-002`, `LC2-007`).
3. [x] Introduce the backend module registry (`LC2-003`, `LC2-004`).
4. [x] Introduce frontend core/plugin navigation registries (`LC2-008`, `LC2-009`).
5. [x] Add clean-database core-only boot/install tests (`LC2-014` through `LC2-016`).
6. [x] Add the legacy-full regression lane (`LC2-023`).
7. [x] Complete the remaining LC-2 operational proofs before beginning UI v2.

Do not delete or move current module code in this first queue. The first milestone creates a safe,
testable composition boundary while preserving existing customer schools.
