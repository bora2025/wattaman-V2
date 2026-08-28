# Wattanam V2 — Completion Checklist

> Derived tracking view only. [platform-master-execution-plan.md](./platform-master-execution-plan.md) defines each work package (WP), owner, dependency, and acceptance evidence required. [implementation-baseline.md](./implementation-baseline.md) is the authoritative evidence ledger. Where they disagree, those two documents win — update this file to match them, never the reverse. A box is checked only when the named acceptance evidence actually exists in `docs/acceptance/` or the baseline traceability table; "in progress" items list exactly what remains.

Legend: `[x]` verified · `[~]` in progress (remainder noted) · `[ ]` not started.

Last reconciled: 2026-08-28, against commits through `67a6797` plus the uncommitted C-001/C-002 plugin migration-rollback and lifecycle-lock increment.

## 0. Business decisions (Product Owner) — block their listed freeze gate

- [ ] DEC-001 Core license — gate **E0**
- [ ] DEC-002 Commercial model — gate **E0**
- [ ] DEC-003 Tenancy — gate **A0**
- [ ] DEC-004 Base product scope — gate **A0**
- [ ] DEC-005 Launch region (Cambodia/Khmer-English/USD-KHR) — gate **A0**
- [ ] DEC-006 Connectivity (offline-first) — gate **E0**
- [ ] DEC-007 Publishing model — gate **F0**
- [ ] DEC-008 Hosting (Railway/Compose) — gate **B0**
- [ ] DEC-009 Payments provider order — gate **E1**
- [ ] DEC-010 Storage (volumes → S3) — gate **B0**
- [ ] DEC-011 Plugin trust model — gate **C0**
- [ ] DEC-012 Telemetry (opt-in only) — gate **D0**
- [ ] DEC-013 Entitlement token format — gate **E0**

All 13 are still `proposed`, not `accepted`. None of their freeze gates may close silently — this is the single biggest planning-to-delivery blocker and needs the Product Owner, not engineering.

## Phase A — decisions, inventory, contracts · Gate A0/A1

- [ ] **A-001** (PO) Approve or replace DEC-001–013
- [~] **A-002** (PL) Module/route/env-var/provider/file/Prisma-model ownership map — [technical-inventory.md](./architecture/technical-inventory.md) exists; field-level sensitivity/retention/export/deletion classification remains
- [ ] **A-003** (PL) ADRs for deployment, tenancy, database, plugin trust, storage, licensing, telemetry, payments
- [ ] **A-004** (SEC) Threat model: installation, update, licensing, marketplace, payments, publisher
- [~] **A-005** (PL) Support matrix — [support-matrix.md](./architecture/support-matrix.md) exists; exact version/upgrade windows need Gate A approval
- [ ] **A-006** (FL) Privacy/retention/terms/refunds/taxes/export/publisher-agreement requirements
- [ ] **A-007** (PL) Core/plugin/shared/deprecated module classification + target workspace boundaries
- [ ] **A-008** (SEC) Secrets inventory: generation/custody/rotation/expiry/revocation/redaction
- [~] **A-009** (PL) Controlled NestJS/toolchain upgrade — Multer pinned to 2.2.0, 0 high/critical in production audit; 12 moderate + 10 dev-tool findings and the full upgrade/E2E matrix remain
- [ ] **A-010** (PL) Versioned public REST/WebSocket/mobile/plugin contract catalog

## Phase B — legacy adoption & production school provisioning · Gate B0/B1/B2

- [~] **B-001** (BE) Read-only legacy preflight + offline adoption command — `legacy-preflight.js` built and verified against a Railway PostgreSQL 18 fixture; 2 sanitized real legacy snapshots still needed
- [~] **B-002** (BE) Adopt existing DB into migration history + singleton install identity — `legacy-adopt.js` verified end-to-end on a synthetic Angkor-School-shaped fixture (preserved owner/users, one installation, one audit, idempotent resume); real legacy database rehearsal remains
- [ ] **B-003** (QA) Row-count/hash/relationship/login/workflow comparison before/after adoption
- [~] **B-004** (FE/QA) Automated browser setup against real PostgreSQL — manual owner setup verified on the Railway Core reference; automated browser E2E submission still open
- [ ] **B-005** (SRE) Immutable, digest-pinned, signed API/web/gateway images + Railway template
- [ ] **B-006** (SRE) Automated one-project-per-school provisioning
- [ ] **B-007** (SRE) Automated custom-domain state machine (pending/verified/active/error)
- [ ] **B-008** (SRE) Scheduled backups + quarterly restore drills
- [ ] **B-009** (SUP) Handoff/ownership/escalation/renewal/domain/DR runbooks
- [ ] **B-010** (PL) Controlled core upgrade orchestration (preflight/backup/migrate/health-gate/rollback)
- [~] **B-011** (BE) Complete interactive + unattended installer preflight — unattended CLI installer exists and is guarded/tested (`INS-005`); storage/email/provider-reachability/license/locale/initial-plugin preflight checks remain
- [~] **B-012** (SRE) Full installation recovery set (DB + uploads + plugin files/settings/manifests as one unit) — PostgreSQL backup/restore verified on Railway PG18 with identity/schema-fingerprint match; plugin-files/settings/manifest bundling into one cross-project drill remains
- [ ] **B-013** (PL) Background-worker process boundary + scale trigger
- [ ] **B-014** (PL) Expo mobile client certification against versioned APIs
- [ ] **B-015** (PL) Storage interface + reversible local-volume ↔ S3-compatible migration

Manual proof exists that the Railway Core reference topology (private PostgreSQL/API/web, public gateway only, exact-origin CORS, persistent `/data` volume) works end-to-end — see [implementation-baseline.md §Railway Core Reference Deployment](./implementation-baseline.md#railway-core-reference-deployment). That is not the same as the *automated* B-005–B-007 provisioning this phase requires.

## Phase C — stable plugin core & announcements cutover · Gate C0/C1/C2/C3

- [x] **C-001** (BE) Deliberately-failing plugin migrations roll back on PostgreSQL — verified live on disposable PostgreSQL 16: SQL and migration history roll back together, staged files are removed, a failed update visibly marks the existing row `failed` without touching the plugin's working version ([gate-c-plugin-migration-lock-2026-08-28.md](./acceptance/gate-c-plugin-migration-lock-2026-08-28.md))
- [x] **C-002** (BE) Migration policy/lock/timeout/progress/failure state — every lifecycle mutation takes a transaction-scoped advisory lock (concurrent same-plugin requests verified to serialize live; different plugins don't block each other), has an explicit 30s timeout, and self-heals a crash-orphaned install directory on retry (verified live); progress/failure states write back to the registry
- [~] **C-003** (PL) Audit + notification adapters + granular permission evaluation — SDK 1.0 events/routes/jobs/settings/storage/permissions/navigation/pages/health/cleanup have contract tests; dispatch now enforces per-route permission grants (was SUPER_ADMIN-only) and audits every attempt with actor/plugin/outcome ([gate-c-plugin-permission-audit-2026-08-28.md](./acceptance/gate-c-plugin-permission-audit-2026-08-28.md)); plugins can now send email/SMS through the core notification service via a capability-gated adapter ([gate-c-plugin-notification-adapter-2026-08-28.md](./acceptance/gate-c-plugin-notification-adapter-2026-08-28.md)); frontend page/nav permission enforcement, notification-send auditing, and a per-plugin sending quota remain
- [~] **C-004** (BE) Move announcements business data/API to the official plugin — reference plugin proves the full lifecycle; the actual legacy announcement business-data cutover is pending PostgreSQL validation
- [ ] **C-005** (QA) Install/update/disable/remove/reinstall/core-upgrade certification matrix
- [ ] **C-006** (PL) Freeze SDK 1.0 + compatibility/deprecation policy
- [ ] **C-007** (SEC) Plugin review checklist + malicious-fixture suite (traversal/bombs/tampering/capability abuse/SSRF/secret access)
- [ ] **C-008** (PL) Plugin CLI, typed SDK package, local harness, templates, sign/publish tooling — informal `plugin:keygen`/`plugin:pack` scripts exist under `backend`; the full public developer-tooling package does not yet

## Phase D — official repository & release operations · Gate D0/D1/D2

- [~] **D-001** (SRE) Production marketplace deployment with managed PostgreSQL + artifact storage — separate marketplace PostgreSQL, restart-surviving immutable artifacts, and signed index are verified in the foundation drill; production object-storage/custody hardening remains
- [ ] **D-002** (SEC) Separate publisher/repository key custody + rotation + quorum procedure
- [ ] **D-003** (PL) Compatibility resolver + signed core/plugin/advisory index
- [ ] **D-004** (SRE) Release pipeline: SBOM/provenance/signatures/staged channel promotion
- [ ] **D-005** (BE) School update preflight + maintenance workflow
- [ ] **D-006** (SEC/SUP) Advisory/withdrawal/emergency-disable/communication process
- [ ] **D-007** (QA) Outage/slow-network/corrupt-artifact/replay/downgrade/restore test suite

## Phase E — customer identity, licensing, entitlements, payments · Gate E0/E1/E2/E3

- [ ] **E-001** (BE/SEC) Customer identity, verified email, MFA, recovery, session rotation, audit
- [ ] **E-002** (BE) Installation registration challenge (installation ID ↔ public key binding)
- [x] **E-003** (BE/FL) Product/price/order/invoice/refund/entitlement state machines — verified; commerce invariants + reversal-lifecycle tests pass
- [x] **E-004** (BE/SEC) Signed offline entitlement token service — verified; local Ed25519 verification, window/audience/installation/product checks tested
- [ ] **E-005** (BE) School entitlement cache + outage grace policy
- [ ] **E-006** (FE) Customer portal + school owner licensing UI
- [x] **E-007** (BE) Payment-provider interface + manual invoice adapter — verified; shares the same ledger as online settlement
- [x] **E-008** (BE/SEC) Online payment webhook adapter — verified 2026-08-28; authenticity/replay/duplicate/out-of-order/retry tests pass, raw events retained
- [~] **E-009** (FL/BE) Refund, dispute, expiry, revocation — implemented and tested 2026-08-28 (see [gate-e-refund-dispute-revocation-2026-08-28.md](./acceptance/gate-e-refund-dispute-revocation-2026-08-28.md)); the new migration has not yet been applied to a live PostgreSQL instance, and FL policy sign-off (refund/dispute rules under DEC-002/DEC-009) has not happened
- [ ] **E-010** (QA) Full commerce + offline certification (purchase → token → offline use → renewal/refund/outage matrix)
- [ ] **E-011** (FE) Compatible-plugin catalog, checkout, entitlement-protected download UI

## Phase F — publisher governance & controlled marketplace · Gate F0/F1/F2

- [ ] **F-001** through **F-009** — all not started. This is correct and intentional: Gate F0 keeps publishing closed until Gate E3 (finance reconciliation + refund drill) passes, and E3 hasn't been reached.

## Cross-cutting workstreams (run through every phase, not a separate finish line)

- [~] **Security** — 0 high/critical production findings; 12 moderate + 10 dev-tool findings and the A-009 controlled upgrade remain; A-004 threat model and A-008 secret custody/rotation records not started
- [ ] **Reliability/observability** — no structured-logging/metrics/alerting implementation yet (§13.2)
- [ ] **CI/CD** — no automated PR/release pipeline in the repo yet; all verification this session was run manually (§13.3)
- [~] **Data privacy/lifecycle** — model-level ownership mapped ([technical-inventory.md](./architecture/technical-inventory.md)); field-level classification/retention/export/deletion rules remain (§13.4, tied to A-002/A-008)
- [ ] **Documentation/support readiness** — no QA/Support runbook rehearsal evidence yet (§13.5)
- [ ] **Accessibility/localization** — Khmer/English, timezone/currency, keyboard/screen-reader work not yet evidenced (§13.6)

## Release gates at a glance

| Gate | State |
|---|---|
| A0/A1 (architecture baseline) | not reached — 0/13 decisions accepted |
| B0/B1/B2 (installable core) | not reached — manual Railway Core proof exists; automated provisioning/legacy/domain/recovery gates open |
| C0–C3 (plugin-capable core) | not reached — no third-party access is correctly still closed; migration-failure rollback (C1) is now live-verified; SDK freeze (C6) and the review/tooling packages (C-005–008) remain |
| D0–D2 (official repository) | not reached — production key custody and outage drills open |
| E0–E3 (paid official plugins) | **furthest along** — E-003/004/007/008/009 done; E0 decisions, E-001/002/005/006/010/011, and E3 finance reconciliation remain |
| F0–F2 (controlled marketplace) | correctly untouched by design |

## What actually blocks the most forward progress right now

1. **DEC-001–013 approval (PO).** Nothing in Gates A0, B0, C0, D0, E0/E1, or F0 can formally close without these, no matter how much engineering happens underneath them.
2. **Two sanitized real legacy database snapshots (B-001/B-002/B-003).** Everything downstream of "adopt an existing school" is blocked on getting real (sanitized) data to rehearse against — this needs someone outside engineering to source it.
3. **A live PostgreSQL run of migration `20260828070000_commerce_reversal_lifecycle`.** No Docker/Railway database access existed in this session; this is a same-day close-out once that access is available.
4. **Browser-driven E2E (B-004, INS-004).** Repeatedly deferred across sessions for lack of a browser-automation runtime; needs that tooling enabled once, not new design work.
5. **A-002/A-007 field-level classification and A-008 secret custody.** These block A1 and are referenced as prerequisites by Data Privacy/Lifecycle, E-001 identity, and part of SEC-001 — worth doing once, early, since several later phases cite them as dependencies.
