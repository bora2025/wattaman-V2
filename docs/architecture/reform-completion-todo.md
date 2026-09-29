# Wattanam architecture reform — completion TODO

Status: working queue, 2026-09-22. This is a readable execution view, not a replacement for the [lean-core checklist](./lean-core-plugin-implementation-checklist.md), [module migration tracker](./module-to-plugin-progress-checklist.md), or each plugin's acceptance evidence. Check a box only after its linked gate has evidence. Local source code, a published package, a hosted installation, and a certified cutover are different milestones.

Catalog-wide baseline: all 13 discovered official plugins pass real-source signed packaging,
verification, dependency-ordered install/activation, reverse-order deactivate/removal, durable-data
preservation, signed previous-version rollback, forward update and reinstall/reactivation locally
([evidence](../acceptance/lean-core/wordpress-style-official-plugin-catalog-lifecycle-2026-09-28.md)).
This does not replace each plugin's PostgreSQL, hosted, browser/device, review or pilot evidence.
All 13 packages also declare and locally certify runtime health, data classification,
database/file backup participation, required restore verification, preserved uninstall data,
Marketplace pricing authority, and support/privacy metadata
([evidence](../acceptance/lean-core/wordpress-style-official-plugin-operational-contract-2026-09-28.md)).
Recovery-set v2 now enforces these declarations before restore, binds exact manifest digests and
reports legacy rollback-generation exceptions; strict real PostgreSQL and hosted restore executions
remain open
([evidence](../acceptance/lean-core/wordpress-style-plugin-recovery-contract-v2-2026-09-28.md)).

## Start here — next work

- [x] **1. Clarify the two MP-1 scopes.** The wave tracker's MP-1 low-coupling proof is closed using Announcements certification, including service-level clean-core marketplace installation and a restore drill ([summary](../acceptance/mp1-low-coupling-proof-summary-2026-09-15.md)). The detailed lean-core checklist tracks the separate, incomplete Document Designer feature extraction. No tracker status needs to be reversed; do not treat Document Designer as cut over or the service-level proof as a hosted end-to-end drill.
- [~] **2. Finish LC4-001.** The live drill is now checked in and the two-instance conditional-create
  race is fixed and tested. The complete local drill passes against a digest-pinned MinIO origin.
  Required PR CI now builds its pinned MinIO version from upstream source instead of relying on the
  removed Docker Hub image; its contracts and complete workflow pass local validation. Obtain its
  first green run, then run it against the hosted production-shaped artifact
  store and record the non-secret immutability, restart, and scale result in
  `docs/acceptance/lean-core/`.
- [~] **3. Finish Document Designer (MP-1).** Scoped asset APIs and host image-management UI are
  implemented locally; legacy embedded-asset inventory now hashes/deduplicates portable images and
  blocks remote, malformed, unsupported, or over-quota payloads before adoption, while exact design
  reconciliation preserves their bytes through rollback. Backup-bound additive conversion now
  copies those bytes into plugin-scoped storage with deterministic IDs while retaining legacy
  sources. Version 0.1.6 also projects legacy text, converted images and QR placeholders into the
  bounded v2 render model; solid rectangle/circle/line shapes are also host-rendered while
  record-bound photos accept only bounded embedded rasters or same-origin paths. Validated
  linear/radial gradients and dashed/dotted borders are host-rendered; malformed styles, remote
  photos and unconverted images fail closed. Page frames, layer order, allowlisted typography,
  image opacity/radius and QR/photo borders pass a deterministic local preservation contract
  ([evidence](../acceptance/mp1-document-designer-visual-parity-contract-2026-09-28.md)). Its enhanced
  CI rehearsal now generates the adopted template and compares page, converted asset, geometry and
  style semantics. Its enhanced PostgreSQL 16 run passes with exact source/target parity, one
  deduplicated scoped asset, verified rendered output, rollback and preservation; hosted pixel parity
  and hosted restored-backup proof remain open. A bounded generation contract is implemented locally in
  0.1.2 without cross-domain reads; 0.1.3 adds a validated positioned render model and safe
  host-owned print/Save-as-PDF preview. Academic class-roster row scope now passes locally, and
  0.1.4 adds a bounded Directory/HR staff source that exposes no contact, CV-history or payroll data
  ([evidence](../acceptance/mp1-document-designer-staff-source-2026-09-25.md)). Bounded pointer
  drag/resize and host-rendered shape creation now pass 12 phone/tablet/desktop browser checks with
  clean teardown; complete pixel/output parity and hosted
  browser certification ([evidence](../acceptance/mp1-document-designer-drag-resize-2026-09-25.md)). The actual 0.1.6
  source now passes signed packaging, production verification and the local clean-core Marketplace
  download/install/activation pipeline ([evidence](../acceptance/mp1-document-designer-clean-core-marketplace-install-2026-09-28.md)); certify that same install on a newly provisioned hosted core, restored-backup adoption, output parity,
  rollback, lifecycle, backup/restore, then a controlled pilot. A guarded non-destructive rollback
  drill now passes locally ([evidence](../acceptance/mp1-document-designer-rollback-drill-2026-09-25.md)). The real signed 0.1.6
  archive also passes local production-service install/activate/deactivate/remove/reinstall/reactivate
  with plugin data preserved. Keep legacy data until its rollback
  window is approved.
- [~] **4. Finish Academic Management (MP-2) before dependent cutovers.** Lifecycle/outbox events
  and dependent contract fixtures are reconciled complete with current tests. Student profile
  additive schema, deterministic preflight, and backup-bound journaled adoption now pass locally
  with exact count/hash reconciliation; fail-closed non-destructive rollback tooling also passes
  locally. Complete plugin-owned academic schema, identity/runtime binding, roster/enrollment
  contracts, and student/class/admissions UI. Class roster reads and mutations now use plugin-owned
  Student profiles and enrollment intervals locally, while core User remains the stable account
  identity. Runtime plugin SQL is now namespace-only; core identities and role checks use the
  capability-gated Directory adapter ([evidence](../acceptance/mp2-academic-runtime-sql-isolation-2026-09-23.md)). The six headerless migrations published in 0.1.0 are preserved byte-for-byte through a
  checksum-pinned installer compatibility rule ([evidence](../acceptance/mp2-academic-immutable-migration-compatibility-2026-09-23.md)). Student Profile routing is now legacy-default with
  explicit plugin reads and atomic parity-checked shadow writes locally; certify that seam against
  real PostgreSQL. The unified cutover gate now includes Student Profile parity and journal checks.
  Restored-backup CI now covers foundation, profiles, enrollment, classes, canonical subjects, and
  all three admissions datasets; subjects and admissions both pass their guarded PostgreSQL 16
  rehearsals with exact parity and preservation. The Study Year restored-backup gate into
  Attendance Manager also passes PostgreSQL 16 with exact row/current-year parity. The aggregate
  cutover checker now includes enrollment parity and its reconciled
  backup-bound journal, closing the last omitted Academic dataset. The unified aggregate gate now
  passes against one restored PostgreSQL 16 school with all seven dataset groups, eight reconciled
  journals, exact fingerprints and both owner plugins active
  ([evidence](../acceptance/lean-core/wordpress-style-existing-school-academic-aggregate-rehearsal-2026-09-28.md)).
  Hosted lifecycle, cutover/rollback approval, and pilot checks remain.
  Duplicate Study Year runtime ownership is also closed: Academic Management 0.1.12 registers no
  Study Year routes and consumes Attendance Manager's versioned read model; its published migration
  remains immutable dormant history.
  Local implementation reconciliation on 2026-09-25 closes Admissions workflow and Academic UI
  checklist items: version 0.1.10 includes Subject and Department management, canonical subject lookup, explicit Department
  plugin-owner CRUD, idempotent approved-registration account/profile materialization, and bounded
  plugin-owned CSV roster import. Real-PostgreSQL adoption, hosted certification,
  lifecycle/recovery and pilot evidence remain open.

## Dependent plugins — one at a time after MP-2

- [~] **5. Attendance Manager (MP-3).** Student school-day ownership is inventoried and enforced in Attendance Manager 0.1.7; staff attendance belongs to Human Resources, lesson attendance to Timetable, and course attendance to Learning per ADR-0019 ([inventory](./mp3-attendance-surface-inventory.md), [boundary evidence](../acceptance/mp3-attendance-ownership-boundary-2026-09-25.md)). Additive correction/scan/alert/snapshot/delivery-ledger/adoption storage, dated Academic roster integration, the idempotent unified scan command, device policy, granular permissions, row scope, declarative scanner/correction/settings/report UI and suspension-safe alert jobs/realtime are implemented locally ([UI evidence](../acceptance/mp3-attendance-declarative-ui-2026-09-25.md), [alert evidence](../acceptance/mp3-attendance-alert-lifecycle-2026-09-25.md), [adoption preflight](../acceptance/mp3-attendance-adoption-preflight-2026-09-25.md)). The exact published migration lineage now installs through a checksum-pinned compatibility path, and a guarded real-PostgreSQL CI certification covers Study Year concurrency, student-only enforcement, correction audit, report output, minimized projections and alert delivery ([certification evidence](../acceptance/lean-core/wordpress-style-attendance-postgres-certification-2026-09-26.md)). Backup-bound adoption/reconciliation/rollback tests are green. Remaining work is the first hosted green run, legacy client cutover, hosted report parity, browser camera/QR and USB device evidence, restored-backup execution and full lifecycle pilot certification.
- [~] **6. Timetable (MP-4 in the lean-core checklist).** Use the [Timetable worksheet](./timetable-plugin-extraction.md): release 0.1.4 explicitly requires Academic Management for stable class identity; namespaced lesson attendance, constrained atomic generation, rich scheduling UI, teacher-attendance UI, scheduled-teacher directory and Wattaman scanner operate locally through plugin APIs. The privacy-safe eight-dataset toolkit includes verified-backup binding, guarded dry-run, resumable crash-safe copying, exact reconciliation and metadata-only rollback ([adoption evidence](../acceptance/mp4-timetable-adoption-preflight-2026-09-25.md)). A guarded real-PostgreSQL CI certification now covers immutable migrations, directory references, non-mutating preview, concurrent collision enforcement, generation and teacher attendance; fresh creation also persists period configuration ([certification evidence](../acceptance/lean-core/wordpress-style-timetable-postgres-certification-2026-09-26.md)). The first hosted run, restored-backup execution, hosted role/browser/device parity, lifecycle pilot and legacy cutover remain open. Switch legacy routes only after parity and rollback proof.
- [~] **7. Examination and Learning (MP-5/6).** Examination 0.1.4 now has an additive eight-table namespaced foundation, compatible owner identity migrations, granular permissions, class/creator-scoped exam and question management, atomic exam/question creation, guarded lifecycle transitions, roster-authorized answer-key-safe student delivery, transaction-locked attempt start/submit, automatic/manual grading, audited reset notification, creator/class-scoped gradebooks, canonical Academic-subject validation, guarded subject/period CRUD, roster-validated transactional bulk scores and a bounded gradebook report projection. The legacy rich-question set now has a shared plugin-owned validation/redaction/grading contract with partial credit and manual essays, and its row-scoped report is connected to shared print/CSV/PDF UI; both pass focused local tests. Its privacy-safe eight-dataset toolkit includes verified-backup binding, guarded zero-write dry-run, exact approved-source binding, resumable idempotent copying, exact post-copy reconciliation and metadata-only rollback, all passing locally ([worksheet](./examination-plugin-extraction.md), [adoption evidence](../acceptance/mp5-examination-adoption-preflight-2026-09-25.md)); real-PostgreSQL adoption/rollback and concurrency execution, hosted rich-question/report workflows and lifecycle certification remain open. Learning 0.1.2 now has a complete 13-table foundation plus an explicitly approval-gated multi-attempt identity migration, Academic/directory identity boundaries, granular permissions, class/creator-scoped course and assignment discovery/creation, guarded course lifecycle, lesson/page and rich quiz authoring, dated-roster enrollment, student discovery, transaction-locked answer-key-safe lesson and quiz players, creator/admin-scoped locked manual grading, atomic late-penalty completion, idempotent history-preserving lesson reset with post-commit notification, monotonic lesson engagement, roster-validated course-session attendance, scoped engagement reporting, seven host-rendered teacher/student workspaces, and a privacy-safe 13-dataset backup-bound adoption/reconciliation/rollback toolkit passing locally ([worksheet](./learning-plugin-extraction.md), [adoption evidence](../acceptance/mp6-learning-adoption-preflight-2026-09-25.md), [UI evidence](../acceptance/mp6-learning-declarative-ui-2026-09-25.md)); hosted PostgreSQL/concurrency proof, full legacy UI parity and lifecycle certification remain open. Extract and certify each plugin separately.
  Examination `0.1.5` now also serializes absent-row attempt creation and has guarded real-PostgreSQL CI certification for immutable migrations, answer-key redaction, concurrent start/submit, automatic grading, gradebooks, reports and minimized projections ([certification evidence](../acceptance/lean-core/wordpress-style-examination-postgres-certification-2026-09-26.md)). Its first hosted run, restored-backup execution and browser/pilot evidence remain open; Learning remains independently incomplete as described above.
  Learning `0.1.3` now has exact approval-bound real-PostgreSQL CI certification for its destructive multi-attempt migration, course lifecycle, enrollment, redacted lesson playback, concurrent attempt start/finish and roster-bound course attendance ([certification evidence](../acceptance/lean-core/wordpress-style-learning-postgres-certification-2026-09-26.md)). Its first hosted run, restored-backup execution, browser/accessibility, notification delivery and pilot evidence remain open.
- [~] **8. Transportation/Communication, Finance/HR, Parent Portal/Reporting (MP-7/9).** Transportation and Communication have guarded local foundations/adoption tooling. Finance 0.1.3 has isolated minor-unit fee/receipt/settings storage, transactional immutable receipts and compensating reversal ([worksheet](./finance-plugin-extraction.md), [foundation](../acceptance/mp8-finance-foundation-2026-09-25.md)); its privacy-safe exact-only legacy read preflight passes 7 tests and blocks rounding or unknown monetary policy ([preflight](../acceptance/mp8-finance-adoption-preflight-2026-09-25.md)). Human Resources has six normalized employee/CV/payroll/staff-attendance tables, Directory role validation, minor-unit payroll segregation, host-rendered pages, an actor-free staff attendance projection, and a document-safe title projection ([worksheet](./human-resources-plugin-extraction.md), [evidence](../acceptance/mp8-human-resources-foundation-2026-09-25.md)). Parent Portal has its guarded linking/composition foundation and Reporting has administrator-scoped student and staff summaries using only Directory and versioned read models, with host-rendered exports ([Reporting worksheet](./reporting-plugin-extraction.md)). All six runtime certifications pass against PostgreSQL 16.14 ([evidence](../acceptance/lean-core/wordpress-style-official-plugin-postgres-runtime-certification-2026-09-28.md)). Restored-backup, hosted, privacy and lifecycle certification remains open; Finance/HR still need specialist approval and legacy cross-feature reporting remains until certified cutover.
  
  Transportation `0.1.3` now also has extension-driven dashboard discovery and guarded
  real-PostgreSQL CI certification for immutable migrations, Directory-validated vehicles,
  Academic-roster riders, transactional location capture, privacy-minimized projections and
  recipient-scoped realtime delivery
  ([certification evidence](../acceptance/lean-core/wordpress-style-transportation-postgres-certification-2026-09-26.md)).
  Its first hosted run, restored-backup execution, legacy cutover, GPS/device/browser proof and
  pilot remain open.

  Finance `0.1.1` now also has a permission-separated immutable compensating reversal ledger and
  guarded real-PostgreSQL CI certification for enrollment-bound fees, minor-unit concurrency,
  overpayment prevention, unchanged receipt rows, one-time reversal and minimized balance
  projections
  ([certification evidence](../acceptance/lean-core/wordpress-style-finance-postgres-certification-2026-09-26.md)).
  Specialist approvals, hosted print/report parity, restored-backup execution and pilot evidence
  remain open.

  Parent Portal `0.1.2` now also serializes request resolution before account mutation and has
  guarded real-PostgreSQL CI certification for concurrent approval, roster row scope, keyed reads
  and graceful mixed-provider composition
  ([certification evidence](../acceptance/lean-core/wordpress-style-parent-portal-postgres-certification-2026-09-26.md)).
  Hosted onboarding, browser/accessibility, restored-backup execution and pilot evidence remain.

  Reporting `0.1.2` now also neutralizes spreadsheet formula prefixes and has guarded
  real-PostgreSQL CI certification using the core read-model table for administrator authorization,
  roster-key scope, mixed-provider degradation, privacy minimization and staff/student exports
  ([certification evidence](../acceptance/lean-core/wordpress-style-reporting-postgres-certification-2026-09-26.md)).
  Hosted role/browser proof, restored-backup legacy parity, lifecycle, cutover approval and pilot
  evidence remain.

For **every** plugin in steps 5–8, keep a separate evidence record for: ownership inventory; signed marketplace-only clean install; route and row-scope tests; disable/update/remove/reinstall with data preserved; restored-backup adoption and reconciliation; rollback; portable backup/restore; security/privacy/accessibility review; controlled pilot. Remove legacy code or tables only after the approved rollback window.

## Final production-default gate — do last

- [ ] **9. Prove lean core is genuinely empty of optional business features.** No optional schema, compiled business pages/static navigation, jobs/gateways/providers, or local package-upload path in the core distribution. Optional starter bundles must install through marketplace transactions. LCF-005 is now proven by a fresh physical core build containing only 27 admitted routes and a strict zero-violation backend/frontend artifact scan; the overall gate remains open for LCF-004 database execution and the other final acceptance conditions.
  The optional-schema sub-gate now uses an exact migration-derived allowlist instead of a five-table
  blacklist. Its implementation, CI contract and disposable PostgreSQL 16 execution pass: both the
  fresh and recovery-restored core databases contained exactly 29 canonical tables and zero
  unexpected tables, closing LCF-004
  ([evidence](../acceptance/lean-core/wordpress-style-no-optional-schema-2026-09-28.md)).
  The physical core runtime sub-gate is now closed: the compiled-artifact verifier rejects decorated
  optional providers, controllers, jobs, processors, resolvers and gateways, and CI boots the same
  verified bundle ([evidence](../acceptance/lean-core/wordpress-style-no-optional-runtime-2026-09-28.md)).
  Starter bundles now pass the complete local two-database Phase E certification: 75 checks cover
  account/MFA, school registration and key rotation, mixed free/paid acquisition, signed package
  installation, interruption-safe retry, removal with preserved data and reinstall. Hosted
  clean-school/browser proof remains ([evidence](../acceptance/lean-core/wordpress-style-starter-bundles-2026-09-28.md)).
  The executable `architecture:clean-core:gate` now measures this requirement directly. Its first
  baseline reports 135 violations (23 compiled backend modules/proxies and 112 frontend routes),
  with fixture coverage for clean, directory-based and bundled artifacts
  ([evidence](../acceptance/lean-core/wordpress-style-clean-core-artifact-baseline-2026-09-25.md)).
  Physical core-only backend and frontend builds now reduce the gate to zero local violations and
  run in required PR validation. Docker, hosted runtime and lifecycle certification are still open
  ([evidence](../acceptance/lean-core/wordpress-style-physical-core-artifacts-2026-09-25.md)).
  The core beta release workflow now also rebuilds and scans those physical artifacts before
  explicitly publishing the two core Dockerfiles; a required contract prevents regression to
  legacy-full release images
  ([release evidence](../acceptance/lean-core/wordpress-style-core-release-image-enforcement-2026-09-26.md)).
  Signed beta `0.2.0` is published from the physical core release path with retained scan and
  blueprint evidence; runtime certification of those exact released digests remains open
  ([evidence](../acceptance/lean-core/wordpress-style-core-release-image-enforcement-2026-09-26.md)).
- [~] **10. Prove both deployment paths.** Railway release rendering and the separate self-hosted
  `docker-compose.core.yml` now explicitly bind core distribution, digest-pinned application
  images, health dependencies and persistent database/API state; required contracts pass
  ([blueprint evidence](../acceptance/lean-core/wordpress-style-core-deployment-blueprints-2026-09-26.md)).
  A CI acceptance harness now builds and boots the physical core topology, performs fresh setup,
  rejects representative legacy UI/schema, and creates a recovery artifact
  ([automation evidence](../acceptance/lean-core/wordpress-style-core-deployment-smoke-automation-2026-09-26.md)).
  A real local Docker run now passes fresh setup, core-only schema/UI and a full recovery-set restore
  into isolated database/file targets after fixing two image packaging blockers and PostgreSQL
  client/server major selection. The API runtime image now excludes development dependencies and
  both production dependency graphs pass a moderate-or-higher audit gate
  ([security evidence](../acceptance/lean-core/wordpress-style-core-runtime-dependency-security-2026-09-26.md)).
  Hosted CI run `36521359176` passes the complete source-built fresh-install and isolated
  restore/reconciliation topology. Released-digest execution remains open. On a clean Railway
  school and an operator-controlled self-hosted Docker school,
  still install released core images, link marketplace,
  install free and paid plugins, exercise workflows, disable, update, restore and upgrade core.
  Record exact digests, versions, reconciliation and rollback results.
  The new fail-closed [Railway core preflight](../acceptance/lean-core/wordpress-style-railway-core-hosted-preflight-2026-09-28.md)
  confirms the linked school is healthy and installed but rejects it as evidence because its current
  distribution is `legacy-full`; use a separate clean `core` school for the hosted gate.
  The provisioner now supports that explicit core project safely and rejects distribution/blueprint
  mismatches before Railway mutation. Creation remains blocked until signed registry-qualified API,
  web and gateway image digests exist
  ([evidence](../acceptance/lean-core/wordpress-style-railway-core-provisioning-guard-2026-09-28.md)).
- [~] **11. Existing-school upgrade path.** The executable [existing-school upgrade runbook](../operations/existing-school-lean-core-upgrade-runbook.md) now defines supported-school gates, dependency order, every local preflight/dry-run/adopt/rollback command, fail-closed exceptions, staged owner switches and the 90-day rollback window. Document Designer has a required real-PostgreSQL restored-backup CI rehearsal whose first local run passed exact adoption and rollback with both datasets preserved ([evidence](../acceptance/lean-core/wordpress-style-existing-school-document-designer-rehearsal-2026-09-26.md)). Academic Management has required representative-data PostgreSQL 16 rehearsals for its [department/membership foundation](../acceptance/lean-core/wordpress-style-existing-school-academic-foundation-rehearsal-2026-09-26.md), [student-profile boundary](../acceptance/lean-core/wordpress-style-existing-school-academic-student-profiles-rehearsal-2026-09-26.md), [enrollment intervals](../acceptance/lean-core/wordpress-style-existing-school-academic-enrollment-rehearsal-2026-09-26.md), [class records](../acceptance/lean-core/wordpress-style-existing-school-academic-classes-rehearsal-2026-09-26.md), [canonical subjects](../acceptance/lean-core/wordpress-style-existing-school-academic-subjects-rehearsal-2026-09-28.md), [admissions](../acceptance/lean-core/wordpress-style-existing-school-academic-admissions-rehearsal-2026-09-28.md), and [Attendance-owned Study Years](../acceptance/lean-core/wordpress-style-existing-school-attendance-study-years-rehearsal-2026-09-28.md), all with exact parity and rollback preservation. The complete [Attendance Manager](../acceptance/lean-core/wordpress-style-existing-school-attendance-manager-rehearsal-2026-09-28.md), [Timetable](../acceptance/lean-core/wordpress-style-existing-school-timetable-rehearsal-2026-09-28.md), [Examination](../acceptance/lean-core/wordpress-style-existing-school-examination-rehearsal-2026-09-28.md), [Learning](../acceptance/lean-core/wordpress-style-existing-school-learning-rehearsal-2026-09-28.md), [Transportation](../acceptance/lean-core/wordpress-style-existing-school-transportation-rehearsal-2026-09-28.md), [Finance](../acceptance/lean-core/wordpress-style-existing-school-finance-rehearsal-2026-09-28.md), [Parent Portal](../acceptance/lean-core/wordpress-style-existing-school-parent-portal-rehearsal-2026-09-28.md), [Communication](../acceptance/lean-core/wordpress-style-existing-school-communication-rehearsal-2026-09-28.md), and stateless [Reporting parity](../acceptance/lean-core/wordpress-style-existing-school-reporting-rehearsal-2026-09-28.md) boundaries now have required real-PostgreSQL gates proving zero-write dry run or stateless execution, exact reconciliation/parity, and preservation. The item remains open until all hosted runs pass, every remaining boundary/plugin is covered, and each production school has signed acceptance or an approved exception.
  Human Resources now also has a six-dataset [restored-school gate](../acceptance/lean-core/wordpress-style-existing-school-human-resources-rehearsal-2026-09-28.md) with exact-only money conversion and rollback preservation; payroll/privacy approval remains explicitly open.
- [ ] **12. Release approval.** Obtain security, privacy, legal, finance, support, and operations sign-off. Only then change new-install default from `legacy-full` to `core` (LCF-001).

## How to update this list

Finish one numbered item, attach test/drill evidence under `docs/acceptance/`, then update the authoritative gate checklist and this list together. A local test can complete a coding subtask, but cannot by itself close hosted, real-device, pilot, or approval tasks. Do not publish a source-only plugin as production-ready or remove legacy tables before the rollback gate.
