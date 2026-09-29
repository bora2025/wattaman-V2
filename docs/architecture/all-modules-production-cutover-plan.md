# All Modules Production Cutover Plan

Status: **execution plan — production gates open**  
Created: **2026-09-29**  
Scope: Wattanam lean core, official plugins, existing customer schools, Marketplace and Platform Admin

Related documents:

- [WordPress-style core/plugin reform](./wordpress-style-core-plugin-reform-plan.md)
- [Module-to-plugin migration plan](./module-to-plugin-migration-plan.md)
- [Module migration progress](./module-to-plugin-progress-checklist.md)
- [Reform completion TODO](./reform-completion-todo.md)
- [Existing-school upgrade runbook](../operations/existing-school-lean-core-upgrade-runbook.md)

## 1. Objective

Move every optional business capability from the transitional `legacy-full` distribution to an
independently installable, signed and Marketplace-delivered plugin. Complete the transition for new
and existing schools without losing data, weakening permissions, interrupting unrelated plugins, or
removing the rollback path prematurely.

This plan distinguishes three states:

1. **Implemented** — plugin source, migrations and automated tests exist.
2. **Production cut over** — production schools use the plugin as the sole live owner and have passed
   migration, parity, lifecycle, recovery and pilot gates.
3. **Legacy retired** — the rollback window has expired and obsolete code/tables have been removed
   through a separately reviewed release.

Publishing a plugin or passing local tests does not by itself complete production cutover.

## 2. Target modules and ownership

| Order | Target plugin | Capability moved from legacy core | Required dependency |
|---:|---|---|---|
| 1 | Academic Management | students, admissions, classes, registrations, departments, subjects | Core Directory |
| 2 | Human Resources | employee records, CV, payroll and staff identity projections | Core Directory |
| 3 | Communication | announcements, posts, messaging and delivery | Core notifications |
| 4 | Document Designer | card/certificate templates, assets, preview, generation and print | Core storage |
| 5 | Attendance Manager | study years, sessions, holidays, student attendance, scans, corrections and attendance reports | Academic Management |
| 6 | Timetable | rooms, periods, schedules, generation, teacher schedule and lesson attendance | Academic Management |
| 7 | Examination | exams, questions, attempts, scores, gradebooks, reports and exports | Academic Management |
| 8 | Learning | courses, lessons, assignments, quizzes, submissions, grading and engagement | Academic Management |
| 9 | Transportation | routes, stops, vehicles, riders, location and transport reports | Academic Management |
| 10 | Finance | fees, discounts, payments, receipts, reversals and finance reports | Academic Management |
| 11 | Parent Portal | parent links and permitted cross-plugin views | Academic Management plus installed providers |
| 12 | Reporting | cross-plugin dashboards and exports | Installed provider read models only |

The existing `announcements` compatibility package must be reconciled with Communication. There
must be one canonical owner for each announcement/post/message route and dataset before Communication
cutover is accepted.

## 3. Non-negotiable rules

- New schools use `WATTANAM_DISTRIBUTION=core`; existing schools remain `legacy-full` until their
  approved upgrade window.
- Plugins may use only documented Core/Plugin SDK contracts and versioned provider read models.
- A plugin may not directly query another plugin's private tables.
- Marketplace is the production package source. Operators do not copy package files into schools.
- Every artifact is immutable, checksummed, publisher-signed and repository-signed.
- Migration is additive first. Legacy tables remain read-only during the rollback window.
- Every cutover has a verified backup, zero-write dry run, exact reconciliation and tested rollback.
- Route ownership is switched only after plugin parity; dual writers are prohibited unless a
  time-bounded, tested bridge is explicitly approved.
- Disable/uninstall preserves data by default. Data purge is a separate privileged action.
- No legacy code/table deletion occurs in the same release that performs production cutover.

## 4. Shared readiness gate for every plugin

Before a module enters a production pilot, all boxes in its cutover packet must be complete.

### A. Ownership and dependency contract

- [ ] Inventory every legacy page, route, table, file, job, notification, permission, report, print
      flow, export and external integration.
- [ ] Assign one owner to every field, relationship and write operation.
- [ ] Document required/optional plugin dependencies and compatible versions.
- [ ] Replace cross-module database access with versioned contracts/read models/events.
- [ ] Identify every legacy environment ownership flag and its plugin value.

### B. Marketplace release

- [ ] Package contains manifest, immutable migrations, permissions, capabilities, UI extensions,
      jobs, health checks, retention policy, support metadata and compatible core range.
- [ ] Automated security, dependency, signature and package-path checks pass.
- [ ] Platform review approves the release.
- [ ] Beta installs from Marketplace on a clean `core` school without local file copying.
- [ ] Stable promotion records exact artifact hash, signing keys and release notes.
- [ ] Free/paid entitlement, renewal, grace, revocation and offline behavior pass when applicable.

### C. Data adoption and reconciliation

- [ ] Restorable pre-cutover recovery set is created and restore-tested.
- [ ] Dry run performs zero writes and reports privacy-safe counts/hashes.
- [ ] Adoption is journaled, resumable, idempotent and safe after interruption.
- [ ] Duplicate, orphan, timezone, currency and identity rules are explicit.
- [ ] Post-copy reconciliation proves exact approved-source coverage.
- [ ] Rollback changes routing metadata back without deleting plugin or legacy data.

### D. Functional and security parity

- [ ] API contracts and validation match approved behavior.
- [ ] UI, navigation, empty/loading/error states and responsive layouts pass.
- [ ] Role, permission and row-scope tests cover allow and deny cases.
- [ ] Jobs, notifications, realtime, imports, exports, print and PDF/CSV flows pass.
- [ ] Supported camera, QR, USB, GPS or other device workflows pass on real devices where relevant.
- [ ] Audit records contain actor, target, outcome and correlation identifiers.
- [ ] Accessibility, privacy minimization and security review pass.

### E. Lifecycle and recovery

- [ ] Install, activate, disable and re-enable pass without a core rebuild.
- [ ] Update succeeds and a failed update returns to the previous healthy generation.
- [ ] Uninstall removes executable code while retaining declared data.
- [ ] Reinstall detects retained data without duplicating records.
- [ ] Full backup and restore include plugin code, schema, mutable data and registry state.
- [ ] Core upgrade with the plugin installed passes compatibility checks.
- [ ] Plugin failure does not prevent login, Plugin Manager, billing or recovery access.

## 5. Standard production cutover procedure

### Stage 1 — Prepare

1. Select one internal or low-risk pilot school.
2. Record core version, plugin versions, database lineage, deployment digests and current owner flags.
3. Verify current health, backup storage, free disk space and Marketplace connection.
4. Publish the candidate as Beta and install it without activating production ownership.
5. Run the restored-backup rehearsal using a recent sanitized or controlled backup.

### Stage 2 — Shadow and compare

1. Keep legacy reads/writes authoritative.
2. Populate plugin storage with the approved adoption command.
3. Compare normalized API results, UI totals, reports, prints and exports.
4. Exercise plugin reads using production-shaped roles and data volumes.
5. Resolve every mismatch or record an approved exception; unexplained differences block cutover.

### Stage 3 — Change window

1. Announce the maintenance window and freeze affected legacy writes/jobs.
2. Create and verify the final recovery set.
3. Run final adoption and exact reconciliation.
4. Activate the plugin and switch its documented route/read owners to `plugin`.
5. Restart API, worker and web services when required.
6. Run automated smoke tests and the module-specific manual checklist.
7. Reopen the capability only after all critical checks pass.

### Stage 4 — Observe and expand

1. Monitor errors, latency, queue failures, reconciliation drift and unexpected legacy requests.
2. Keep a named rollback decision owner available throughout the observation window.
3. Obtain pilot-school and operator acceptance.
4. Promote the proven artifact to Stable.
5. Roll out in controlled batches: internal, pilot, 10%, 25%, 50%, 100%.
6. Stop the rollout on any severity-one issue or unexplained data mismatch.

### Stage 5 — Retain and retire

1. Keep legacy tables read-only and backups recoverable for at least the approved 90-day window.
2. Prove no legacy writes, routes, jobs, pages or static navigation are used.
3. Archive the final reconciliation, acceptance and rollback evidence.
4. Remove legacy code in a separate release.
5. Drop legacy tables only in another reviewed, reversible migration after backup verification.
6. Preserve offline historical readers required for recovery or regulated exports.

## 6. Dependency-ordered rollout waves

### Wave 0 — Platform and clean-core proof

Complete before any broad customer rollout:

- provision one persistent Railway school using the physical `core` distribution;
- validate Marketplace claim/link, free and paid acquisition, signed install and entitlement refresh;
- run plugin-aware backup/restore and exact released-image upgrade/rollback;
- deploy monitoring and alert delivery for API, worker, gateway, jobs and plugin health;
- verify the core has no optional routes, tables, jobs, pages or static business navigation;
- approve security, privacy, legal, finance, support and operations policies.

Exit: a clean school can be operated, recovered and extended entirely through Marketplace.

### Wave 1 — Foundation owners

Cut over in this order:

1. Academic Management
2. Human Resources
3. Communication
4. Document Designer

Exit: identity/directory, academic roster, notifications and document contracts are stable; dependent
plugins no longer rely on legacy private tables.

### Wave 2 — High-value independent verticals

Cut over one at a time:

1. Attendance Manager
2. Timetable
3. Examination
4. Learning

Attendance requires camera/QR/USB and report evidence. Timetable requires collision, generation,
teacher schedule, lesson attendance and print evidence. Examination and Learning must separately
prove answer-key protection, concurrency, grading, reset and learner/teacher row scope.

### Wave 3 — Operational and financial verticals

1. Transportation
2. Finance

Transportation requires GPS/device/privacy evidence. Finance additionally requires finance-specialist
approval, exact minor-unit reconciliation, immutable receipt/reversal proof and hosted print/report
parity. Finance is never bundled into another plugin's acceptance.

### Wave 4 — Composition plugins

1. Parent Portal
2. Reporting

These cut over last because they consume versioned data from several providers. They must degrade
gracefully when an optional provider is absent and must never bypass provider row scope.

### Wave 5 — Existing-school fleet completion

- upgrade every supported school in controlled batches;
- record signed acceptance or a time-bounded approved exception for every installation;
- eliminate unknown/unsupported legacy variants;
- finish the 90-day rollback window for the final migrated school;
- then change the new-install/default runtime policy from `legacy-full` to `core` only after formal
  release approval.

## 7. Per-plugin production evidence still required

The repository already contains extensive local and CI implementation evidence. The following are
the principal production-cutover gaps and must be confirmed against the linked detailed plans before
execution.

| Plugin | Required production evidence before cutover |
|---|---|
| Academic Management | hosted clean run, browser parity, restored-school execution, pilot and all academic owner switches |
| Human Resources | hosted lifecycle, restored backup, payroll/privacy specialist approval and pilot |
| Communication | hosted outage/retry, WebSocket reconnect, browser/mobile delivery, restored backup and pilot |
| Document Designer | hosted generation/print, storage recovery, restored backup and pilot |
| Attendance Manager | legacy client cutover, hosted reports, real camera/QR/USB, restored backup and lifecycle pilot |
| Timetable | hosted run, role/browser/device/print parity, restored backup, ownership switch and pilot |
| Examination | hosted rich-question/report/print workflows, restored backup, concurrency and pilot |
| Learning | hosted lesson/quiz/assignment/grading, accessibility, delivery, restored backup and pilot |
| Transportation | GPS/device/browser/privacy proof, restored backup, legacy cutover and pilot |
| Finance | finance approval, hosted receipt/print/report parity, restored backup and pilot |
| Parent Portal | hosted onboarding, browser/accessibility, mixed-provider behavior, restored backup and pilot |
| Reporting | hosted role/browser/export parity, mixed-provider degradation, restored backup and pilot |

## 8. Rollback decision and procedure

Rollback immediately for data loss/corruption, authentication or authorization bypass, duplicate
financial records, incorrect student disclosure, sustained critical errors, or failed reconciliation.

Rollback sequence:

1. Put the affected capability in maintenance mode.
2. Stop plugin jobs and writers.
3. Preserve logs, audit events and current database state for investigation.
4. Switch documented route/read owners back to `legacy`.
5. Restore the pre-cutover recovery set only if metadata rollback cannot safely recover service.
6. Verify legacy counts, permissions and primary workflows.
7. Reopen legacy operation and create an incident record.
8. Do not resume rollout until the defect and rehearsal gap are understood and corrected.

## 9. Evidence packet and sign-off

Create one dated acceptance document per plugin and school/batch containing:

- school installation ID and environment;
- Git commit, core version, plugin version and artifact hashes;
- database lineage and migration journal identifiers;
- backup identifier and demonstrated restore result;
- dry-run, adoption and reconciliation output;
- automated test/run links and manual browser/device results;
- before/after ownership variables;
- monitoring observation period and incident summary;
- rollback test result;
- customer/operator acceptance;
- security/privacy review, plus finance approval where applicable;
- approver names, timestamps and any expiration-bound exceptions.

Required signers are module owner, operations, security/privacy and pilot-school owner. Finance and HR
plugins additionally require their domain specialists. Platform-wide completion requires legal,
support and release-management approval.

## 10. Program tracking table

Use `not started`, `in progress`, `pilot`, `cut over`, `retention`, or `retired`. Do not use
`complete` for implementation-only evidence.

| Plugin | Package/CI | Hosted gate | Restored-data gate | Pilot | Fleet cutover | Retention | Legacy retired |
|---|---|---|---|---|---|---|---|
| Academic Management | in progress | not started | in progress | not started | not started | not started | not started |
| Human Resources | in progress | not started | in progress | not started | not started | not started | not started |
| Communication | in progress | not started | in progress | not started | not started | not started | not started |
| Document Designer | in progress | not started | in progress | not started | not started | not started | not started |
| Attendance Manager | in progress | not started | in progress | not started | not started | not started | not started |
| Timetable | in progress | not started | in progress | not started | not started | not started | not started |
| Examination | in progress | not started | in progress | not started | not started | not started | not started |
| Learning | in progress | not started | in progress | not started | not started | not started | not started |
| Transportation | in progress | not started | in progress | not started | not started | not started | not started |
| Finance | in progress | not started | in progress | not started | not started | not started | not started |
| Parent Portal | in progress | not started | in progress | not started | not started | not started | not started |
| Reporting | in progress | not started | in progress | not started | not started | not started | not started |

The initial values are deliberately conservative. Update them only from current acceptance evidence,
not from package existence or an earlier status summary.

## 11. Definition of full program completion

The all-module cutover is complete only when:

- every supported existing school has migrated or has an approved retirement/exception plan;
- every optional capability is installed and operated as a Marketplace plugin;
- new schools deploy the `core` distribution by default;
- production has no optional legacy writers, jobs, routes, UI or static navigation;
- all customer batches completed their observation and rollback-retention windows;
- backups can restore core, plugin artifacts, plugin data and registry/entitlement state;
- legacy code is removed and legacy tables are archived/dropped through approved releases;
- no plugin directly depends on another plugin's private storage;
- security, privacy, legal, finance, support and operations approvals are recorded;
- final CI, hosted browser/device, backup/restore, upgrade and rollback suites pass against the exact
  production release artifacts.

Until all conditions hold, keep `legacy-full` available only as controlled migration/rollback
infrastructure and do not delete its modules.

## 12. Academic Management cutover — active execution packet

Academic Management is the first production-cutover target. Its aggregate adoption and parity gate
already covers departments/memberships, student profiles, enrollment intervals, classes, subjects
and admissions. Study Years remain owned by Attendance Manager and are a dependency check, not an
Academic Management runtime route to reclaim.

Run these read-only ownership checkpoints from `backend/`:

```powershell
$env:ACADEMIC_EXPECTED_OWNER = 'legacy'
npm.cmd run db:academic-management:ownership-check

# After data adoption, parity approval and the controlled owner switch:
$env:ACADEMIC_EXPECTED_OWNER = 'plugin'
npm.cmd run db:academic-management:ownership-check
```

The post-switch check requires all nine Academic runtime boundaries to be `plugin` and both legacy
shadow writers to be `false`. It exits non-zero for an incomplete or invalid configuration, which
prevents a partial cutover from being treated as complete. The aggregate
`db:academic-management:cutover-check` also embeds this ownership result; it defaults to the safe
pre-switch expectation (`legacy`) and uses `ACADEMIC_EXPECTED_OWNER=plugin` for post-switch proof.

Academic Management execution order:

- [x] Define a machine-readable aggregate ownership gate and focused tests.
- [x] Bind ownership phase validation into the aggregate data/journal/backup cutover report.
- [ ] Run the legacy-owner checkpoint on the selected hosted pilot school.
- [ ] Create and restore-test the pilot school's final recovery set.
- [ ] Install/activate the signed Stable Academic Management release.
- [ ] Run aggregate and component preflight/dry-run/adoption commands.
- [ ] Obtain exact aggregate reconciliation with all journals bound to the verified backup.
- [ ] Pass hosted administrator/teacher/student role, browser and API parity.
- [ ] Freeze academic legacy writes and switch the nine owner variables in a maintenance window.
- [ ] Disable both legacy shadow-write variables and pass the plugin-owner checkpoint.
- [ ] Observe health, errors, latency, jobs and unexpected legacy traffic for the approved window.
- [ ] Exercise rollback, then reapply the approved plugin configuration.
- [ ] Obtain pilot-school, operations and security/privacy acceptance.
- [ ] Roll out through the fleet batches and begin the final school's 90-day retention window.
