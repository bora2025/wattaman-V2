# Wattanam V2 Platform Master Execution Plan

| Plan field | Value |
|---|---|
| Plan version | 1.0 |
| Planning status | Complete |
| Completion audit | 2026-08-28 |
| Delivery status | Foundation verified; phased implementation continues |
| Authority | This document, reconciled with the implementation evidence ledger |

## 1. Authority and purpose

This is the authoritative execution plan for Wattanam V2. It translates the target architecture in [platform-architecture-plan-a-to-z.md](./platform-architecture-plan-a-to-z.md) into ordered, estimable work and reconciles it with the evidence ledger in [implementation-baseline.md](./implementation-baseline.md).

Phase A technical records are the [technical ownership inventory](./architecture/technical-inventory.md), [support matrix](./architecture/support-matrix.md), and [ADR index](./architecture/adr/README.md).

When documents disagree:

1. Released code and recorded acceptance evidence define current state.
2. This document defines delivery order, ownership, decisions, and gates.
3. The A-to-Z architecture defines target design and invariants.
4. Topic documents define operational detail.

Status vocabulary is `verified`, `in progress`, `planned`, or `decision required`. A capability is verified only by the evidence named in its acceptance criteria.

## 2. Product and architectural decisions

The plan uses these Version 1 defaults. The product owner may replace a default only through a recorded decision before its listed freeze gate.

| ID | Decision | Version 1 default | Status | Freeze gate |
|---|---|---|---|---|
| DEC-001 | Core license | Proprietary commercial distribution; customer retains contractual data-export rights | proposed | E0 |
| DEC-002 | Commercial model | Annual subscription for updates/support; installed core remains usable after expiry | proposed | E0 |
| DEC-003 | Tenancy | One legal school organization per installation; campuses are children of that school, not tenants | proposed | A0 |
| DEC-004 | Base product | Identity, roles, students, staff, academic structure, attendance, audit, installation, backup, plugin host | proposed | A0 |
| DEC-005 | Launch region | Cambodia first; Khmer and English; USD and KHR; `Asia/Phnom_Penh` default | proposed | A0 |
| DEC-006 | Connectivity | Daily internet is optional; installation and signed package import work offline; paid rights use offline tokens | proposed | E0 |
| DEC-007 | Publishing | Wattanam-only through Milestone E; invited verified publishers in F pilot; no open upload in V1 | proposed | F0 |
| DEC-008 | Hosting | One Railway project per school is supported managed hosting; Docker Compose on Linux is supported self-hosting | proposed | B0 |
| DEC-009 | Payments | Provider adapter with manual/offline invoice first, Stripe-compatible card adapter second | proposed | E1 |
| DEC-010 | Storage | Railway/local persistent volumes first; S3-compatible adapter after file inventory | proposed | B0 |
| DEC-011 | Plugin trust | Reviewed, signed, in-process server plugins; capabilities are contracts, not a sandbox | proposed | C0 |
| DEC-012 | Telemetry | Opt-in operational telemetry only; no student, grades, attendance, fees, messages, or location payloads | proposed | D0 |
| DEC-013 | Entitlement format | Ed25519-signed canonical JSON, installation-bound, with a default 30-day offline refresh grace period | proposed | E0 |

`proposed` means planning is complete but business approval is not. The product owner changes it to `accepted` or records replacement text, approver, date, and affected work packages before the freeze gate. No decision may silently pass its gate.

## 3. Scope and non-goals

Version 1 delivers an independently deployable school system, first-run owner setup, signed official plugins, signed updates, offline-tolerant entitlements, auditable orders/payments, and a controlled publisher pilot. It does not deliver multi-school shared tenancy, arbitrary unreviewed code, Kubernetes, multi-region active-active operation, continuous cloud dependence, or a public self-service plugin store.

The separate [student self-attendance plan](./student-self-attendance-plan.md) remains a product feature backlog. It is not a dependency of the platform/commercial release train and must pass its own policy decisions and security gates.

## 4. Current verified baseline

Acceptance evidence dated 2026-08-27 proves:

- Production configuration, exact CORS, JWT enforcement, authenticated sockets, liveness/readiness/version, and owner diagnostics.
- Four checked-in Prisma migrations on fresh PostgreSQL 16.
- Concurrent first-run setup creates one installation and one owner.
- Healthy Compose packaging, persistence, PostgreSQL backup, checksum manifest, and restore into an empty database.
- Signed plugin inspection/install/activation, settings, storage, jobs, events, declarative UI, safe mode, recovery backup, and namespaced migration.
- Separate marketplace PostgreSQL, verified official publisher, immutable artifact, signed index, restart persistence, and repository-to-school verified download.
- Backend tests/build/typecheck, marketplace tests/build/audit, and frontend production build.

Evidence: [foundation-runtime-2026-08-27.md](./acceptance/foundation-runtime-2026-08-27.md). Open work is never inferred as complete from this baseline.

Deployment evidence dated 2026-08-28 additionally proves that the reference Railway Core project contains isolated PostgreSQL, API, web, and gateway services; only the gateway is public; the API uses a persistent `/data` volume; exact-origin CORS is configured; and the public gateway health, API health/readiness/version/installation-status, and browser setup routes all return HTTP 200. The owner subsequently completed setup for the `Angkor School` reference installation; automated browser submission evidence remains a separate Gate B requirement.

## 5. Ownership model

One person may hold multiple roles in a small team, but every work package has exactly one accountable role. In an owner such as `BE/SEC`, the first role is accountable and later roles are required contributors.

| Role | Accountable for |
|---|---|
| Product Owner (PO) | Commercial rules, launch scope, policy approval, go/no-go |
| Platform Lead (PL) | Architecture, core contracts, deployment, release integration |
| Backend Engineer (BE) | APIs, database, jobs, entitlement and payment services |
| Frontend Engineer (FE) | Owner/admin/publisher/customer workflows and accessibility |
| DevOps/SRE (SRE) | Railway templates, CI/CD, secrets, backups, monitoring, drills |
| Security Lead (SEC) | Threat models, supply chain, review gates, incidents, key custody |
| QA Lead (QA) | Test plans, fixtures, end-to-end automation, evidence archive |
| Finance/Legal (FL) | Terms, tax/invoice rules, refunds, publisher agreements, privacy |
| Support Lead (SUP) | Runbooks, escalation, customer communication, support ownership |

Estimate units are ideal engineer-weeks (`ew`) excluding approval wait time. Ranges include implementation, tests, docs, and review. Calendar duration depends on staffing; estimates are not commitments.

## 6. Dependency map and release train

```text
A: decisions/inventory
        |
        v
B: adoption + production deployment -----> B release candidate
        |
        v
C: stable plugin core + data cutover ----> SDK 1.0 freeze
        |
        v
D: official repository + release ops ----> official free plugins
        |
        v
E: identity + entitlements + payments ----> paid official plugins
        |
        v
F: governance + publisher pilot ---------> controlled marketplace
```

Security, QA, documentation, observability, and support run across every phase. No downstream milestone may weaken an upstream invariant.

## 7. Phase A — decisions, inventory, and contracts

Target: close planning ambiguity, public-contract ambiguity, and dependency risk before commercial implementation. Estimate: 6–10 ew.

| WP | Owner | Depends on | Work | Acceptance evidence |
|---|---|---|---|---|
| A-001 | PO | none | Approve or replace DEC-001–013 | Dated decision register with approver |
| A-002 | PL | none | Map backend modules, frontend routes, environment variables, providers, files, and Prisma models to owners | Reviewed inventory with no unowned production table or secret |
| A-003 | PL | A-001 | Record ADRs for deployment, tenancy, database, plugin trust, storage, licensing, telemetry, and payment adapter | ADR index and immutable accepted records |
| A-004 | SEC | A-002 | Threat-model installation, update, licensing, marketplace, payments, and publisher workflows | Abuse cases, trust boundaries, mitigations, residual-risk sign-off |
| A-005 | PL | A-002 | Publish support matrix | Exact Node, PostgreSQL, browser, Linux/Docker, Railway, backup and upgrade windows |
| A-006 | FL | A-001 | Define privacy, retention, terms, refunds, taxes/invoices, data export, and publisher agreement requirements | Approved policy requirements mapped to product controls |
| A-007 | PL | A-002 | Classify every module as core, official plugin, shared contract, or deprecated and define incremental target workspace boundaries | Reviewed dependency graph; no circular public contract; move sequence avoids a flag-day rewrite |
| A-008 | SEC | A-002 | Inventory configuration/secrets and define generation, custody, rotation, expiry, revocation, and redaction | Every production variable has schema, owner, secret class, rotation runbook, and log-safety test |
| A-009 | PL | A-005 | Plan and execute controlled NestJS/toolchain dependency upgrades that resolve known moderate findings without weakening upload, auth, socket, plugin, or migration controls | Production audit report, compatibility notes, full test/build/E2E matrix, and rollback tag; no unresolved high/critical finding |
| A-010 | PL | A-002/A-007 | Inventory and version public REST, WebSocket, mobile and plugin-facing contracts with compatibility/deprecation policy | Generated contract catalog, consumer map, breaking-change checks and one old-client compatibility fixture |

Gate A0: all Version 1 decisions are either approved or carry an owner and blocking deadline. Gate A1: every database model, external provider, secret, and persistent file class has an owning domain and retention rule.

### 7.1 Initial database ownership map

| Domain | Models |
|---|---|
| Platform identity/access | `User`, `RefreshToken`, `Installation`, `Department` |
| Academic structure | `StudyYear`, `Class`, timetable models, `Holiday` |
| Students/family/intake | `Student`, `ParentLinkRequest`, class-registration models |
| Attendance/cards | `Attendance`, `StaffAttendance`, session/schedule/card models |
| Learning/assessment | course, lesson, exam, assignment, quiz, score models |
| Finance/HR | fee, payment, salary, staff-profile models |
| Communication/content | message, notification, announcement, post, site-setting models |
| Transport | bus, route, stop, and location models |
| Platform audit/plugins | audit models and all `Plugin*` models |

Phase A expands this table to field-level sensitive-data classification, retention, export, deletion, and plugin-access rules.

## 8. Phase B — legacy adoption and production school provisioning

Target: support clean and existing schools on the narrow hosting matrix and define tested growth/mobile paths. Estimate: 12–20 ew.

| WP | Owner | Depends on | Work | Acceptance evidence |
|---|---|---|---|---|
| B-001 | BE | A-002 | Build read-only legacy preflight and authenticated offline adoption command | Fixture reports schema fingerprint, blockers, counts, and makes no writes |
| B-002 | BE | B-001 | Adopt an existing database into migration history and create singleton installation identity | Rehearsal on two sanitized legacy snapshots; repeat run is idempotent |
| B-003 | QA | B-002 | Compare row counts, relationships, hashes of critical fields, login, and core workflows before/after adoption | Signed comparison report; zero unexplained loss |
| B-004 | FE/QA | current baseline | Automate browser setup against real PostgreSQL | Browser creates owner, redirects, locks setup, logs in, and survives restart |
| B-005 | SRE | A-005 | Publish immutable API/web/gateway images and Railway template | Images are digest-pinned, SBOMed, signed, and traceable to tag/commit |
| B-006 | SRE | B-005 | Automate one-project-per-school provisioning | New project has private DB/API/web, public gateway, unique secrets and volumes |
| B-007 | SRE | B-006 | Automate custom-domain state machine | Pending/verified/active/error states; exact DNS instructions; TLS and CORS verification |
| B-008 | SRE | B-006 | Schedule database/volume backups and quarterly restore drills | Restore meets RPO/RTO and evidence is retained outside project |
| B-009 | SUP | B-006 | Create customer handoff, ownership, escalation, renewal, domain, and disaster runbooks | Support simulation completes without engineering-only knowledge |
| B-010 | PL | B-005 | Implement controlled core upgrade orchestration | Preflight, backup, migration, health gate, rollback instructions, maintenance record |
| B-011 | BE | A-008/B-004 | Complete interactive and unattended installer preflight for database, writable storage, email/provider reachability, license acceptance, locale and initial official plugins | Idempotent dry-run plus browser/CLI tests; secrets never echo; partial failure resumes safely |
| B-012 | SRE | B-008/A-002 | Back up and restore database plus uploads, plugin files/settings/storage, configuration metadata, and manifests as one installation recovery set | Cross-project drill verifies checksums, identity, permissions, files, plugin state, login, RPO and RTO |
| B-013 | PL | B-005 | Define background-worker process boundary and scale trigger while retaining database-backed jobs for small schools | API-only and split-worker topologies pass exactly-once/no-overlap and graceful-shutdown tests |
| B-014 | PL | A-010/B-005 | Certify the Expo mobile client against versioned production APIs, installation discovery, authentication/refresh, offline failure, domain change and upgrade behavior | Supported Android/iOS build matrix and old/new API compatibility journeys pass |
| B-015 | PL | A-002/DEC-010/B-012 | Define storage interface and reversible local-volume ↔ S3-compatible migration for growing schools | Integrity/checksum comparison, dual-write cutover test, rollback, backup/restore and access-control evidence |

### 8.1 Railway customer workflow

1. Sales/support creates a customer record without school operational data.
2. Provisioning clones the approved template at an immutable release digest.
3. It creates unique database, JWT, encryption, plugin-trust, and provider secrets; secrets are never copied from another school.
4. It attaches volumes for plugins, plugin data, uploads, and backups.
5. It deploys private PostgreSQL/API/web and public gateway, then waits for readiness.
6. For a new school it exposes `/setup`; for an existing school it runs the offline adoption workflow before public traffic.
7. Domain automation asks Railway for the exact verification records and presents them to the customer.
8. After DNS verification, it sets the final origin consistently in gateway, CORS, cookies, links, and support record.
9. The owner completes setup over HTTPS. Support cannot know or choose the owner password.
10. Provisioning performs smoke tests, backup, restore drill scheduling, and handoff.
11. An unattended installation may create infrastructure and a one-time owner invitation, but never embeds a reusable owner password in variables, logs, templates, or command history.

Domain changes use add → verify → switch canonical URL → retain old redirect temporarily → remove old domain. A domain is never marked active from DNS lookup alone; HTTPS, gateway routing, API readiness, cookie login, WebSocket origin, and setup lock must pass.

Gate B0: support matrix and template approved. Gate B1: clean install and two legacy snapshots pass. Gate B2: a real staging Railway project with a test custom domain passes provisioning, replacement, backup, restore, and upgrade.

## 9. Phase C — stable plugin core and announcements cutover

Target: prove recoverable evolution, provide public developer tooling, and remove duplicated announcements ownership. Estimate: 8–13 ew.

| WP | Owner | Depends on | Work | Acceptance evidence |
|---|---|---|---|---|
| C-001 | BE | B-008 | Execute deliberately failing plugin migrations on PostgreSQL | SQL and history roll back; staged files disappear; recovery archive restores |
| C-002 | BE | C-001 | Add upgrade migration policy, lock, timeout, progress, and failure state | Concurrent lifecycle requests serialize; restart recovery is deterministic |
| C-003 | PL | current SDK | Add audit and notification adapters plus granular permission evaluation | Plugin actions identify actor/plugin; denied permission tests cover every route/page |
| C-004 | BE | C-002/C-003 | Move announcements business data/API ownership to the official plugin | Upgrade copies/verifies data; rollback plan exists; core no longer writes plugin tables |
| C-005 | QA | C-004 | Certification matrix for install/update/disable/remove/reinstall/core upgrade | Supported PostgreSQL/core matrix passes with data-preservation assertions |
| C-006 | PL | C-005 | Freeze SDK 1.0 and compatibility policy | Contract package, examples, deprecation window, support range, changelog |
| C-007 | SEC | C-006 | Plugin review checklist and malicious-fixture suite | Traversal, bombs, tampering, capability abuse, migration abuse, SSRF and secret access reviewed |
| C-008 | PL | C-006/C-007 | Deliver plugin CLI, typed SDK package, local harness, templates, package/sign/publish commands, compatibility test kit, API reference and upgrade guide | A new reference plugin is generated, tested, signed, installed and submitted using public tooling only |

Migration invariant: pending plugin SQL always has a verified recovery point, executes inside a database transaction with immutable history, and cannot access another plugin namespace. Failure leaves the previous executable version and registry state usable. Destructive migrations require a manifest flag, explicit owner confirmation, maintenance mode, and a second backup.

Gate C0: no third-party publisher access. Gate C1: rollback/restore evidence exists. Gate C2: announcements has one authoritative data owner. Gate C3: SDK 1.0 is frozen for the published support window.

## 10. Phase D — official repository and release operations

Target: operate official free plugins and core metadata safely. Estimate: 5–8 ew.

| WP | Owner | Depends on | Work | Acceptance evidence |
|---|---|---|---|---|
| D-001 | SRE | B-005 | Production marketplace deployment with managed PostgreSQL and artifact object storage/volume | Restart/restore drill and immutable-object test |
| D-002 | SEC | A-004 | Separate offline publisher and repository key custody, rotation, revocation, and quorum procedure | Rotation drill; old/new client behavior recorded |
| D-003 | PL | C-006 | Publish compatibility resolver and signed core/plugin/advisory index | Cross-version fixtures and tampered-index rejection |
| D-004 | SRE | D-003 | Release pipeline creates SBOM, provenance, signatures, digests, notes, and staged channel promotion | One release promoted beta → stable without rebuilding bytes |
| D-005 | BE | D-003 | School update preflight and maintenance workflow | Blocks incompatible active plugins; requires backup; records result and recovery path |
| D-006 | SEC/SUP | D-003 | Advisory, withdrawal, emergency-disable, and customer communication process | Tabletop exercise for compromised plugin and repository key |
| D-007 | QA | D-001–006 | Repository outage, slow network, corrupt artifact, replay, downgrade, restart, and restore tests | Automated evidence demonstrates school continues operating offline |

Gate D0: telemetry decision approved. Gate D1: keys and production service pass disaster drill. Gate D2: a school updates from the repository and recovers from an injected failed update. Only then may official free plugins be generally available.

## 11. Phase E — customer identity, licensing, entitlements, and payments

Target: discover and sell official plugins without making school operation depend on marketplace availability. Estimate: 13–20 ew.

### 11.1 Identity and account boundary

Central marketplace identity is separate from school user identity. It stores customer organization, billing contacts, verified emails, publisher membership, MFA state, sessions, consent versions, and audit events. It never imports school students, staff, grades, attendance, fees, messages, or location data.

| WP | Owner | Depends on | Work | Acceptance evidence |
|---|---|---|---|---|
| E-001 | BE/SEC | A-004/A-006 | Customer identity with verified email, MFA for privileged roles, recovery, session rotation, rate limits, audit | Account takeover/recovery tests and privacy review |
| E-002 | BE | E-001/B-002 | Installation registration challenge binding installation ID and public key | Replay and cross-installation claims rejected; key rotation supported |
| E-003 | BE/FL | A-001 | Product, price, tax class, order, invoice, refund, and entitlement state machines | Transition table and invariants tested |
| E-004 | BE/SEC | E-002/E-003 | Signed offline entitlement token service | Signature, audience, installation, product, version/update window and key ID verified locally |
| E-005 | BE | E-004 | School entitlement cache and grace policy | Marketplace outage does not disable installed functionality or data access |
| E-006 | FE | E-001–005 | Customer portal and school owner licensing UI | Purchase/manual invoice, activation, status, offline import/export, renewal and error journeys |
| E-007 | BE | E-003 | Payment-provider interface and manual invoice adapter | Same order/payment ledger used by manual and online providers |
| E-008 | BE/SEC | E-007 | Online payment webhook adapter | Authenticity, replay, duplicate, out-of-order and retry tests; raw event retained securely |
| E-009 | FL/BE | E-003/E-008 | Refund, dispute, expiry and revocation implementation | Policy-to-state tests; no destructive uninstall or data loss |
| E-010 | QA | E-001–009 | Full commerce and offline certification | Purchase → token → offline use → renewal/refund/outage matrix passes |
| E-011 | FE | D-003/E-003–006 | Deliver compatible-plugin catalog, product/version/license/changelog pages, free acquisition, paid checkout and entitlement-protected artifact download | Anonymous/free/paid/owned/refunded/expired/incompatible journeys enforce visibility and download authorization without exposing artifact storage |

### 11.2 Entitlement contract

The repository signing key does not sign entitlements. A separate entitlement key signs canonical tokens containing schema version, token ID, installation ID, customer ID, product/plugin ID, licensed major range, issued/not-before/expiry timestamps, update-access end, offline recheck deadline, features, issuer, key ID, and nonce. The school pins entitlement public keys and stores only the latest valid token plus audit history.

Rules:

- Token verification is local and does not call the marketplace on every request.
- Subscription expiry ends updates/support after the configured grace period; it does not erase data or silently disable essential read/export behavior.
- Refund/revocation stops future downloads and renewals. Security revocation is a distinct signed advisory process.
- Clock rollback, token replay across installations, unknown keys, invalid audience, and malformed claims fail closed for new activation while preserving data access.
- Online refresh uses exponential backoff and never sends school operational data.

### 11.3 Payment invariants

- Client return URLs never mark an order paid; only verified provider events or an authorized manual settlement do.
- Each provider event has a unique provider/event key and is processed transactionally and idempotently.
- Money uses integer minor units plus ISO currency; no floating point.
- Order totals are computed server-side from versioned price records.
- Entitlement issuance follows a committed payment state and is itself idempotent.
- Refund/dispute events append ledger entries; history is never rewritten.

Gate E0: DEC-001–013 and legal rules approved. Gate E1: identity/payment threat model and provider selected. Gate E2: offline token and outage tests pass. Gate E3: finance reconciliation and refund drill pass. Paid official plugins launch only after E3.

## 12. Phase F — publisher governance and controlled marketplace

Target: invite third parties only after SDK and commercial operations are stable. Estimate: 12–18 ew plus pilot observation.

| WP | Owner | Depends on | Work | Acceptance evidence |
|---|---|---|---|---|
| F-001 | FL/SEC | C-006/E-003 | Publisher agreement, acceptable use, privacy/security requirements, revenue/refund/support rules | Published versioned policies and acceptance records |
| F-002 | BE/SEC | E-001/F-001 | Publisher organization, member roles, identity verification, key enrollment/rotation/revocation | Dual-control verification and audit trail tests, each approval tied to an authenticated actor session — never a self-asserted identity field an API caller could supply on anyone's behalf |
| F-003 | PL | C-007/F-002 | Submission API and automated analysis pipeline | Signature, manifest, dependency, license, malware, secret, vulnerability and migration reports |
| F-004 | SEC/QA | F-003 | Manual review workspace and reproducible test environment | Two-person approval for risky capabilities/migrations, each approval authenticated to a real logged-in reviewer (not a claimed reviewer ID accepted on the strength of a shared credential alone); reviewer evidence retained |
| F-005 | SUP/FL | F-001 | Ownership matrix for core, marketplace, publisher, refund and security support | Customer-facing escalation and response targets |
| F-006 | SEC/SUP | F-004 | Vulnerable, malicious, abandoned, disputed and transferred plugin procedures | Tabletop and withdrawal/advisory drills |
| F-007 | PO/QA | F-001–006/F-009 | Invite 3–5 publishers and 5–10 plugins | Pilot metrics: review time, defects, support burden, SDK gaps, incidents and settlement reconciliation |
| F-008 | PL | F-007 | SDK/policy corrections and public-launch assessment | Explicit go/no-go; unresolved high-risk finding means no public launch |
| F-009 | FL/BE | E-003/E-008/F-001 | Implement publisher revenue ledger, statements, tax/withholding data, refund allocation and manual payout reconciliation for the pilot | Order-to-statement-to-payout reconciliation balances exactly; corrections and payout approval/execution append entries and require dual approval, each approving/executing party authenticated to their own session, not merely named in the request |

Gate F0: publishing remains closed. Gate F1: policies and tooling operational. Gate F2: pilot completes at least one update, rejection, key rotation, vulnerability withdrawal, and support case. Public self-service is a post-V1 decision, not an automatic outcome.

## 13. Cross-cutting workstreams

### 13.1 Security

- Maintain threat models and data-flow diagrams per phase.
- Eliminate critical/high production findings before release; moderate findings require owner, mitigation, and deadline.
- Generate SBOM and provenance for every image/package; scan source, dependencies, images, IaC, and secrets.
- Use distinct keys for publisher packages, repository metadata, entitlements, and container signing.
- Keep private keys outside Git and customer installations; use managed secret custody and dual control for production signing.
- Run annual penetration tests and pre-launch tests for E and F.

### 13.2 Reliability and observability

- Structured JSON logs include request/correlation ID, installation ID, actor ID, plugin ID, release version, action and outcome—never secrets or sensitive record bodies.
- Metrics cover latency/error/saturation, DB pool, jobs, backup age, migration state, plugin failures, repository signing/publication, webhook lag/deduplication, and entitlement refresh.
- Alerts have owner, severity, response target, runbook, and test schedule.
- Initial targets: school API 99.9% monthly availability; marketplace 99.9%; backup RPO 24h and RTO 4h until a paid tier promises better.

### 13.3 CI/CD and environments

Environments are local, CI ephemeral, shared staging, marketplace staging, and production. Customer production is never a test environment. Pull requests run formatting, typecheck, unit/contract/integration tests, migration checks, production audits, secret/IaC scans, and builds. Release candidates additionally run clean install, legacy upgrade, plugin matrix, repository-to-school update, backup/restore, critical browser journeys, SBOM/signature verification, and rollback rehearsal.

Production promotion uses immutable bytes: build once, sign, test digest, promote channel metadata, then deploy canary/reference school before customer waves. Database roll-forward is preferred; rollback never assumes a destructive migration can be reversed.

### 13.4 Data privacy and lifecycle

Every model/field receives classification, lawful purpose, retention, export, deletion/anonymization, backup lifetime, audit policy, and plugin visibility. Marketplace telemetry contains installation/release health identifiers only after opt-in. Support bundles are generated locally, redacted, previewed, and uploaded only with owner consent.

### 13.5 Documentation and support readiness

Each work package updates the relevant owner, administrator, operator, developer, API, privacy, troubleshooting, upgrade, rollback and release documentation in the same change. Documentation examples run in CI where possible. Before every gate, QA and Support execute the published runbook without unpublished engineering knowledge; unclear or missing steps fail the gate. Translations follow the English technical source only after it freezes, then receive Khmer terminology and usability review.

### 13.6 Accessibility, localization and provider integration

Launch workflows support Khmer/English text expansion, Unicode search/input, `Asia/Phnom_Penh`, USD/KHR formatting, accessible keyboard/focus/error behavior, and low-bandwidth recovery. Email, SMS, object storage, error reporting and payment systems sit behind owned adapters with timeout, retry, idempotency, rate-limit, privacy and outage behavior. Provider credentials follow A-008; no provider becomes a hidden requirement for core school operation.

## 14. Test and certification matrix

| Layer | Required coverage |
|---|---|
| Unit | Parsers, state machines, policy, cryptography wrappers, permission decisions |
| Contract | Core SDK, repository envelope, entitlement token, payment provider, events |
| PostgreSQL integration | Fresh/legacy core migrations, plugin success/failure/concurrency, idempotency |
| Browser E2E | Setup/login, admin plugin flow, licensing, purchase, domain-origin behavior |
| Deployment | Compose and Railway staging, replacement, private networking, volumes, custom domain |
| Recovery | Backup checksum, empty restore, installed-target prebackup, identity verification, RPO/RTO |
| Supply chain | Tamper, traversal, archive bomb, unknown/revoked key, downgrade, replay, incompatible dependency |
| Chaos/failure | DB/repository/payment outage, timeout, restart mid-job, webhook duplication/order, full disk |
| Accessibility/localization | Keyboard/screen reader, Khmer/English, timezone/currency, error comprehension |

Required release journeys: new school, legacy school, owner recovery, core upgrade, plugin install/update/failure/remove/reinstall, safe mode, backup/restore, domain change, marketplace outage, purchase/manual invoice, webhook replay, offline entitlement renewal/expiry/refund, advisory withdrawal, publisher key rotation.

Additional identity journeys: installation-owner transfer requires recent re-authentication, acceptance by the new owner, immutable audit, recovery path and assurance that support cannot self-assign ownership. Role/permission changes, MFA recovery, account deletion/export and session revocation are included in browser and API tests.

## 15. Release gates and evidence

| Gate | Release claim permitted | Required evidence |
|---|---|---|
| A | Architecture baseline | Decisions, inventory, ADRs, threat model, support matrix |
| B | Installable core | Clean + legacy install, real Railway/domain, persistence, setup E2E, backup/restore/upgrade |
| C | Plugin-capable core | Failed migration rollback/restore, one-owner announcements cutover, permission/audit tests, SDK freeze |
| D | Official repository | Production key/repository drill, signed release/update/recovery, outage/advisory exercises |
| E | Paid official plugins | Identity/MFA, orders/payments/reconciliation, offline tokens/outage/expiry/refund, legal approval |
| F | Controlled third-party marketplace | Policies, verification, automated/manual review, pilot metrics and incident drills |

For every gate, QA stores release digest, commit, environment, test versions, commands, machine-readable results, screenshots where needed, archive checksums, approvers, exceptions, and expiry dates. A passing lower gate cannot prove a higher one.

## 16. Prioritized backlog and estimates

| Priority | Package | Estimate | Outcome |
|---:|---|---:|---|
| 1 | A-001–010 | 6–10 ew | Decisions, ownership, boundaries, public contracts, secrets, dependency policy and threat models frozen |
| 2 | B-001–004/B-011 | 4–7 ew | Legacy adoption and browser/unattended installation proven |
| 3 | B-005–010/B-012–015 | 7–12 ew | Production Railway/domain/release/full-recovery/mobile/worker/storage path |
| 4 | C-001–003 | 3–5 ew | Migration failure recovery and complete SDK controls |
| 5 | C-004–008 | 5–8 ew | Announcements cutover, SDK 1.0 certification and public developer tooling |
| 6 | D-001–007 | 5–8 ew | Production official release operation |
| 7 | E-001–006/E-011 | 7–10 ew | Customer identity, catalog/acquisition and offline licensing |
| 8 | E-007–010 | 6–9 ew | Auditable payments, refunds and certification |
| 9 | F-001–006/F-009 | 8–12 ew | Publisher governance, review and settlement operations |
| 10 | F-007–008 | 4–6 ew + observation | Controlled pilot and launch decision |

With one engineer, sequence strictly. With a 4–6 person team, policy/threat modeling, Railway automation, QA fixtures, and SDK work may overlap after contracts freeze. The critical path is A decisions → legacy/deployment B → plugin C → repository D → entitlements/payment E → governance pilot F.

## 17. First executable sprint

The next sprint is planning-to-production closure, not payments:

1. Approve the decision register and support matrix.
2. Produce the complete schema/environment/file ownership inventory.
3. Acquire two sanitized legacy database snapshots under a documented handling policy.
4. Specify and implement the legacy preflight/adoption command.
5. Add browser setup E2E against PostgreSQL.
6. Add the failing plugin-migration PostgreSQL fixture and recovery assertion.
7. Create the staging Railway reference project and a disposable DNS test subdomain.
8. Capture Gate B/C evidence in `docs/acceptance/`.

Payments and third-party submission work must not start until their dependency gates pass.

## 18. Consolidated risk register

| Risk | Trigger/indicator | Owner | Preventive control | Contingency and evidence |
|---|---|---|---|---|
| Legacy adoption loses or misclassifies data | Count/hash/relation mismatch | PL | Read-only preflight, sanitized fixtures, idempotent adoption | Stop, restore source copy, investigate signed comparison report |
| Core/plugin ownership remains duplicated | Both core and plugin write same domain | PL | A-007 boundary map and C-004 cutover gate | Disable plugin cutover, roll forward only after single-writer proof |
| Plugin migration damages an installation | SQL/history/files disagree | BE | Backup, namespace parser, transaction, lock, immutable checksum | Safe mode, restore drill, incident artifact from C-001 |
| Signing key compromise | Unexpected signature/publication | SEC | Separate keys, offline custody, dual control, short access path | Halt publication, rotate/revoke, advisory and customer drill |
| Marketplace outage stops school work | Entitlement/update calls fail | PL | Local verification, cached token, no per-request dependency | Offline certification and outage SLO evidence |
| Payment duplication or spoofing | Ledger/provider mismatch | BE | Verified webhooks, idempotency, server totals | Freeze fulfillment, reconcile ledger, replay fixture |
| Domain misconfiguration breaks login | TLS/CORS/cookie/socket mismatch | SRE | B-007 state machine and end-to-end probe | Retain prior domain redirect; rollback canonical origin |
| Backup exists but is incomplete | DB restores but files/plugins do not | SRE | B-012 recovery-set manifest and offsite copies | Keep service stopped; restore last verified complete set |
| Dependency or image vulnerability | High/critical scan finding | SEC | Pinned lockfiles, SBOM, scans, patch window | Block release, emergency patch/advisory process |
| Sensitive data reaches marketplace/logs | Payload classification violation | SEC | A-002/A-008 field maps, opt-in, redaction tests | Disable telemetry, contain, notify under incident/privacy policy |
| SDK churn breaks ecosystem | Compatibility failures/support spike | PL | C-006 freeze, deprecation window, certification matrix | Compatibility shim or delayed core promotion |
| Support surface grows beyond capacity | Response times/backlog breach | SUP | Narrow support matrix, runbooks, pilot limits | Pause onboarding/publishing and revise service levels |

Risks are reviewed at every gate. Each accepted residual risk records probability, impact, owner, treatment deadline, approver and expiry; “known” without a dated treatment is not acceptance.

## 19. A-to-Z traceability matrix

| Architecture section | Execution coverage | Completion proof |
|---|---|---|
| 1 Product definition | Sections 2–3, A-001 | Accepted scope/non-goals |
| 2 Foundational decisions | DEC-001–013, A-001/A-003 | Dated decisions and ADRs |
| 3 System context | Sections 6, 8, 10–12, B-014/B-015 | Deployment/data-flow/mobile/storage diagrams and gate tests |
| 4 Codebase structure | A-007, B-013, C-008 | Reviewed boundary graph and incremental move record |
| 5 Core domain boundaries | A-002/A-007, C-004 | Ownership inventory and single-writer cutover proof |
| 6 Identity/access | B-004/B-011, E-001/E-002, identity journeys | Auth/permission/owner-transfer test evidence |
| 7 Configuration/secrets | A-008, B-005/B-006 | Schema, custody, rotation and redaction drills |
| 8 Database/data lifecycle | A-002, B-001–003/B-012, C-001–004, 13.4 | Adoption, classification, migration and recovery evidence |
| 9 Plugin specification | C-001–007 | Lifecycle, permission, failure and certification matrix |
| 10 Developer experience | C-008 | Public-tooling-only reference plugin journey |
| 11 Installer | B-004/B-011 | Browser and unattended clean/resume/failure E2E |
| 12 Deployment | B-005–013 | Compose/Railway/domain/worker/recovery gates |
| 13 Marketplace | D-001–007, E/F | Production repository, commerce and pilot evidence |
| 14 Licensing/entitlements | E-002–006, 11.2 | Offline/outage/expiry/refund certification |
| 15 Updates | B-010, D-003–007 | Signed promotion/update/failure/recovery evidence |
| 16 Backup/DR | B-008/B-012, C-001, D-001 | Complete recovery-set drills and RPO/RTO |
| 17 Security | A-004/A-008, C-007, D-002/D-006, 13.1 | Threat models, scans, key and incident drills |
| 18 Reliability/observability | B-009, D-007, 13.2 | SLO dashboards, alerts and runbook exercises |
| 19 Testing | Section 14 | Stored gate evidence for the full matrix |
| 20 CI/CD | B-005, D-004, 13.3 | Signed immutable promotion and rollback rehearsal |
| 21 Documentation | B-009, C-008, 13.5 | Runbook test and reviewed localized docs |
| 22 Governance | F-001–008 | Policy, review, withdrawal and pilot evidence |
| 23 Support/operations | B-009, D-006, F-005/F-006, 13.5 | Ownership matrix and support simulations |
| 24 Current-app migration | A-002/A-007, B-001–003, C-004 | Legacy and announcements cutover reports |
| 25 Acceptance gates | Section 15 | Gate dossier with approvals/exceptions |
| 26 Delivery sequence | Sections 6 and 16 | Dependency-respecting work ledger |
| 27 Risks | Section 18 | Reviewed risk register and dated treatments |
| 28 Definition of done | Sections 15 and 20 | Requirement-by-requirement completion audit |
| 29 Initial tasks | First sprint plus A/B/C packages | Closed work packages with evidence links |
| 30 Immediate milestone | Section 17 | Gate B/C sprint evidence |

## 20. Definition of complete planning

Planning is complete when every target capability has a default decision, owner, dependency, estimate, implementation package, security/privacy consideration, failure behavior, acceptance evidence, and release gate; topic documents point to this authority; and unresolved approvals are explicit gate inputs rather than hidden ambiguity. Implementation status continues to be tracked separately in [implementation-baseline.md](./implementation-baseline.md).

## 21. Planning completion audit

Audit result: **complete as of 2026-08-28**. This result certifies the execution plan, not completion of all product implementation.

| Completion requirement | Result | Evidence |
|---|---|---|
| Product scope and explicit non-goals | complete | Sections 2–3 and DEC-001–013 |
| A-to-Z capability coverage | complete | Section 19 maps all 30 architecture sections |
| Work decomposition | complete | 60 packages: A 10, B 15, C 8, D 7, E 11, F 9 |
| Accountable ownership | complete | Section 5 and owner column on every package |
| Dependencies and delivery order | complete | Sections 6–12 and dependency column on every package |
| Estimates and priorities | complete | Phase estimates and Section 16 |
| Security, privacy, reliability and support | complete | Section 13 and risk register |
| Verification and failure evidence | complete | Acceptance-evidence columns and Sections 14–15 |
| Release gates and prohibited early claims | complete | Gates A–F and release-claim matrix |
| Current implementation separated from target state | complete | Section 4 and implementation baseline |
| First executable work sequence | complete | Section 17 |
| Railway customer deployment path | complete | B-005–015 and Railway deployment runbook |
| Commercial, entitlement and publisher path | complete | Phases D–F |
| Open approvals visible and gated | complete | Proposed decisions have explicit freeze gates |

Every planned capability has an accountable role and release gate. Changes after this audit use normal change control: record the changed decision, affected packages, gate impact, approver, and date.

**Change record, 2026-08-30 (engineering, pending SEC review)**: F-002/F-004/F-009's acceptance-evidence wording is strengthened from "dual-control"/"two-person"/"dual approval" to explicitly require each approval be tied to an authenticated actor session, not a self-asserted identity field. This follows a real finding during implementation: the original wording was met at the data level (services correctly rejected a self-review or a duplicate approver ID) while the HTTP layer authenticated only "some caller holds the shared admin token," letting that token's holder forge any specific reviewer's or approver's identity in the request body — silently defeating the two-person guarantee these packages exist to provide. Affected packages: F-002 (key approval/revocation), F-004 (submission review), F-009 (revenue correction/payout approval/payout execution). No gate moves: F0–F2 were never claimed reached, and this closes an implementation gap the original wording should have foreclosed rather than opening a new one. See `docs/architecture/threat-model.md`'s M-5 entry and `docs/completion-checklist.md`'s F-004 entry for the live-verified fix.

## 22. Planning-to-delivery handoff

Planning completion authorizes execution in dependency order; it does not waive acceptance gates. The delivery source of truth is [implementation-baseline.md](./implementation-baseline.md), and test/runtime proof belongs in `docs/acceptance/`. The [completion checklist](./completion-checklist.md) tracks every work package in this section against that evidence and should be reconciled whenever either document changes.

Immediate handoff state:

1. The foundation runtime and a real Railway Core reference deployment are verified.
2. The first owner must complete `/setup`; credentials are never created by the plan or stored in Git.
3. Phase A approvals and inventories close next, followed by the remaining Gate B legacy, automation, domain, recovery, mobile, worker, and storage packages.
4. Plugin, repository, commerce, and publisher claims advance only when Gates C, D, E, and F respectively have stored evidence.
5. “Planning complete” must never be displayed to customers as “platform implementation complete.”
