# Lean Core and Module-to-Plugin Implementation Checklist

Status: **implementation started; LC-1 current-state inventory complete (LC1-001 to LC1-014); LC-0 decision records drafted, awaiting product-owner approval**  
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

Proposed records for all thirteen items were drafted on 2026-09-11 and are awaiting product-owner
approval. The recommendations, including where they refine or depart from the plans, are summarized
in [lc0-architecture-decisions.md](../acceptance/lean-core/lc0-architecture-decisions.md).

- [~] **LC0-001 Product boundary** — accept lean core plus plugin-first as the target distribution.
  Draft: [ADR-0009](./adr/0009-lean-core-product-boundary.md).
- [~] **LC0-002 DEC-004** — amend/supersede the earlier base-module decision that treats academic
  structure and attendance as permanent core. Draft: [ADR-0009](./adr/0009-lean-core-product-boundary.md).
- [~] **LC0-003 Identity ownership** — accept: core owns generic person/account/contact/membership;
  Academic Management owns student/class/enrollment; Human Resources owns employee profile.
  Draft: [ADR-0010](./adr/0010-identity-ownership.md).
- [~] **LC0-004 Plugin UI** — accept declarative UI v2 as the first production UI extension model;
  arbitrary plugin JavaScript is not executed in the core origin. Draft: [ADR-0011](./adr/0011-plugin-ui-declarative-v2.md).
- [~] **LC0-005 Runtime trust** — accept official/reviewed in-process plugins only until a separate
  isolation/governance decision permits third parties. Draft: [ADR-0012](./adr/0012-plugin-runtime-trust.md).
- [~] **LC0-006 Artifact delivery** — accept digest-addressed artifact storage and independent
  verified API/worker caches for Railway. Draft: [ADR-0013](./adr/0013-plugin-artifact-delivery.md).
- [~] **LC0-007 Data preservation** — accept disable/remove preserving data by default and a separate
  confirmed purge operation. Draft: [ADR-0014](./adr/0014-plugin-data-preservation.md).
- [~] **LC0-008 Event consistency** — accept versioned outbox events, idempotent consumers, retry and
  dead-letter handling; no distributed cross-plugin transaction. Draft: [ADR-0015](./adr/0015-cross-plugin-event-consistency.md).
- [~] **LC0-009 Entitlements** — distinguish whole-school platform billing from per-plugin licenses,
  including offline grace, expiry, clock skew and anti-replay. Draft: [ADR-0016](./adr/0016-billing-lock-and-plugin-entitlements.md).
- [~] **LC0-010 Compatibility** — approve supported core/SDK/runtime/plugin/PostgreSQL/Node/browser/
  mobile version windows. Draft: [ADR-0017](./adr/0017-compatibility-windows.md).
- [~] **LC0-011 Communication scope** — decide whether existing Announcements remains standalone or
  becomes part of `wattanam.communication`. Draft: [ADR-0018](./adr/0018-communication-scope.md).
- [~] **LC0-012 Attendance ownership** — confirm student school-day attendance, staff attendance,
  timetable teacher attendance and course attendance owners. Draft: [ADR-0019](./adr/0019-attendance-ownership.md).
- [~] **LC0-013 Governance record** — record approver, decision date, rationale and superseded docs.
  Draft: [lc0-architecture-decisions.md](../acceptance/lean-core/lc0-architecture-decisions.md).

Acceptance:

- [ ] All thirteen decisions have accepted ADRs.
- [ ] `module-boundaries.md` and the architecture master plan agree with those ADRs.
- [ ] No contradictory core/module classification remains.

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

- [ ] **LC2-001 Configuration** — introduce validated `WATTANAM_DISTRIBUTION` values:
  `core` and `legacy-full`.
- [ ] **LC2-002 Safe default** — existing upgraded installations keep `legacy-full` until explicitly
  migrated; new installation policy is separately tested before changing production default.
- [ ] **LC2-003 Module registry** — classify every root module as core, shared, proxy or business.
- [ ] **LC2-004 Backend composition** — `core` does not instantiate business Nest modules.
- [ ] **LC2-005 Worker composition** — `core` does not register business jobs or gateways.
- [ ] **LC2-006 Seed composition** — core-only seeds contain no business demo/data records.
- [ ] **LC2-007 Configuration validation** — invalid profile values fail startup with a clear error.

### LC-2B Frontend composition

- [ ] **LC2-008 Navigation registry** — replace hard-coded business navigation with core and plugin
  contributions.
- [ ] **LC2-009 Core navigation** — expose only Dashboard, Users, Plugins, Marketplace, Settings,
  Backup/Restore, Updates/Health, Platform Billing and authorized Audit/Security.
- [ ] **LC2-010 Route policy** — business routes are unavailable in a core-only distribution.
- [ ] **LC2-011 Dashboard extensions** — business cards come from active plugin contributions.
- [ ] **LC2-012 Search extensions** — business search results come from active plugin providers.
- [ ] **LC2-013 Empty experience** — core-only dashboard explains how to link the marketplace and add
  features without presenting broken or empty module links.

### LC-2C Core-only data and operations

- [ ] **LC2-014 Clean schema design** — define how new core-only databases avoid optional business
  tables while legacy databases remain supported.
- [ ] **LC2-015 Clean database boot** — API and worker boot without querying an optional table.
- [ ] **LC2-016 Installation** — interactive and unattended clean installs succeed.
- [ ] **LC2-017 Identity** — owner login, password recovery, MFA and user administration succeed.
- [ ] **LC2-018 Marketplace** — link, unlink, catalog and marketplace-only installation entry work.
- [ ] **LC2-019 Billing control** — notice, final notice, suspension, owner recovery and reactivation
  work with zero business plugins.
- [ ] **LC2-020 Backup/restore** — core-only recovery into a clean project succeeds.
- [ ] **LC2-021 Updates** — core-only update preflight, maintenance mode and rollback succeed.
- [ ] **LC2-022 Observability** — health, metrics, logs and audit remain available.
- [ ] **LC2-023 Legacy regression** — `legacy-full` preserves current school behavior and data.

Acceptance:

- [ ] Core-only backend, worker and frontend production builds pass.
- [ ] Core-only install and boot pass on a clean supported PostgreSQL database.
- [ ] No business module provider, route, job, gateway or static navigation is active.
- [ ] Legacy-full regression suite passes without destructive migration.

Evidence: `docs/acceptance/lean-core/lc2-core-only-composition.md`

## Gate LC-3 — Plugin UI v2

- [ ] **LC3-001 Schema/version** — define versioned declarative page and component schemas.
- [ ] **LC3-002 Security** — reject scripts, unsafe HTML, untrusted URLs and namespace escape.
- [ ] **LC3-003 Data source** — bind components only to permission-gated plugin routes.
- [ ] **LC3-004 Routing** — support list/detail/create/edit and validated route parameters.
- [ ] **LC3-005 Tables** — sorting, filtering, pagination, selection and empty/loading/error states.
- [ ] **LC3-006 Forms** — validation, conditional fields, server errors and confirmations.
- [ ] **LC3-007 Actions** — create/update/delete, bulk actions and progress reporting.
- [ ] **LC3-008 Dashboard** — cards, charts and status indicators.
- [ ] **LC3-009 Files** — scoped upload, download and previews.
- [ ] **LC3-010 Print/export** — print layout, CSV and PDF actions.
- [ ] **LC3-011 Realtime** — authorized refresh/subscription declarations.
- [ ] **LC3-012 Scanner input** — camera QR and keyboard-wedge input components before Attendance.
- [ ] **LC3-013 Localization** — Khmer/launch languages, timezone and currency formatting.
- [ ] **LC3-014 Accessibility** — keyboard, screen-reader, focus and contrast tests.
- [ ] **LC3-015 Responsive UI** — phone, tablet and desktop certification.
- [ ] **LC3-016 Permission parity** — navigation, page and API enforcement use the same grants.

Acceptance:

- [ ] A signed sample plugin adds a real list/form/detail/print workflow.
- [ ] Installing it requires no core frontend rebuild or redeployment.
- [ ] Disabling it removes its navigation and blocks direct deep links.
- [ ] Malformed and hostile descriptors fail closed.

Evidence: `docs/acceptance/lean-core/lc3-plugin-ui-v2.md`

## Gate LC-4 — Runtime, artifacts and cross-plugin contracts

### LC-4A Artifact distribution

- [ ] **LC4-001 Artifact origin** — use immutable object storage addressed by SHA-256.
- [ ] **LC4-002 API cache** — download and verify missing artifacts before API activation.
- [ ] **LC4-003 Worker cache** — independently download and verify the identical artifact.
- [ ] **LC4-004 Registry generation** — activate a version only after required roles report ready.
- [ ] **LC4-005 Rollback generation** — retain and reactivate the previous healthy artifact.
- [ ] **LC4-006 Mutable storage** — use shared object storage for plugin data in multi-service Railway.
- [ ] **LC4-007 Recovery archive** — retain entitled/withdrawn versions under approved policy.

### LC-4B Contracts and consistency

- [ ] **LC4-008 Parameterized routes** — safe validated parameters within plugin namespaces.
- [ ] **LC4-009 Typed schemas** — version request, response and error contracts.
- [ ] **LC4-010 Outbox** — transactional event publication.
- [ ] **LC4-011 Consumer reliability** — idempotency, retry, backoff and dead-letter handling.
- [ ] **LC4-012 Read models** — reporting and composition without cross-plugin SQL.
- [ ] **LC4-013 Dependency lifecycle** — required, optional and degraded dependency behavior.
- [ ] **LC4-014 Resource quotas** — request, SQL, job, storage, notification and realtime limits.
- [ ] **LC4-015 Safe disable** — stop leases, drain/expire work and unregister extensions.

Acceptance:

- [ ] API and worker survive restart, cache loss, version skew, scaling and rollback.
- [ ] Duplicate/out-of-order events do not duplicate irreversible records.
- [ ] No plugin reads another plugin's tables.

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
2. [ ] Add and validate `WATTANAM_DISTRIBUTION` (`LC2-001`, `LC2-007`).
3. [ ] Introduce the backend module registry (`LC2-003`, `LC2-004`).
4. [ ] Introduce frontend core/plugin navigation registries (`LC2-008`, `LC2-009`).
5. [ ] Add clean-database core-only boot/install tests (`LC2-014` through `LC2-016`).
6. [ ] Add the legacy-full regression lane (`LC2-023`).
7. [ ] Complete the remaining LC-2 operational proofs before beginning UI v2.

Do not delete or move current module code in this first queue. The first milestone creates a safe,
testable composition boundary while preserving existing customer schools.
