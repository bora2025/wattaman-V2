# Wattanam Platform Admin Interface — Architecture and Delivery Plan

Status: **in progress; PA-1 complete and PA-2 read-only operations underway**
Owner: Wattanam platform operations  
Scope: central marketplace, publishers, plugins, customer schools, commerce, support, and platform operations

## 1. Purpose

Build a central, private administration application from which authorized Wattanam staff can operate the marketplace without using bearer tokens, `curl`, direct database access, or a customer school's local admin interface.

The platform admin must support:

- marketplace catalog and release control;
- official and third-party plugin development workflows;
- publisher onboarding and review;
- customer and school-installation management;
- school requests for free, paid, private, or approval-controlled plugins;
- orders, payments, refunds, entitlements, revenue, and payouts;
- advisories, withdrawals, support, audit, monitoring, and incident response.

This is an **operator control plane**, not another school deployment. It is deployed with the central marketplace and never connects directly to a school's PostgreSQL database.

## 2. Non-negotiable boundaries

```text
Platform Admin Web
        |
        | authenticated operator API (HTTPS)
        v
Marketplace API ─── Marketplace PostgreSQL
        |                    |
        |                    └── accounts, schools, requests, releases,
        |                         orders, entitlements, reviews, audit
        |
        ├── Object/artifact storage
        ├── Isolated build and analysis workers
        ├── Payment and email providers
        └── Signed marketplace metadata

Customer School A                      Customer School B
API + Web + PostgreSQL                 API + Web + PostgreSQL
        ^                                      ^
        └──── signed packages and entitlements ┘
```

1. The existing `frontend/app/admin/*` pages remain the **local school admin** interface.
2. The new platform admin is a separate application, recommended path: `apps/platform-admin`.
3. The marketplace API remains the only service allowed to read or mutate marketplace data.
4. The platform admin cannot read students, grades, attendance, fees, messages, files, or other school business data.
5. A platform operator may approve acquisition and issue an entitlement, but cannot silently install or activate a plugin inside a school. Installation remains an explicit school-admin action through the signed package lifecycle.
6. Plugin source and packages are untrusted. Builds and static analysis never run inside the API or admin-web process.
7. High-risk actions use step-up MFA, explicit reason capture, immutable audit, and where identified below, approval by a second operator.

## 3. Personas and permissions

Do not implement one universal `PLATFORM_ADMIN` role. Use deny-by-default permissions and scoped roles.

| Role | Main permissions | Explicit restrictions |
|---|---|---|
| Platform Owner | configuration, role assignment, emergency controls | cannot bypass two-person approvals |
| Marketplace Operator | catalog, schools, plugin requests, manual entitlements | no key custody or payout approval |
| Plugin Reviewer | submissions, automated reports, manual review decisions | cannot review own publisher/submission |
| Security Reviewer | security findings, advisories, emergency withdrawal | cannot alter revenue records |
| Customer Support | customer/school/request/support views and limited corrections | sensitive values masked; no release publication |
| Finance Operator | orders, refunds, statements, reconciliation | cannot publish or sign plugins |
| Payout Approver | payout approval and completion | requester cannot approve own payout |
| Publisher Manager | publisher identity, members, policies, signing-key approval | second-person key approval required |
| Auditor | read-only access to all audit-safe records and exports | no mutations |

Initial permission namespaces:

```text
platform.dashboard.read
operators.read | operators.manage
customers.read | customers.manage
schools.read | schools.manage | schools.entitlements.manage
plugin_requests.read | plugin_requests.review
publishers.read | publishers.review | publishers.manage
plugins.read | plugins.create | plugins.review | plugins.publish | plugins.withdraw
builds.read | builds.run | builds.cancel
orders.read | refunds.create | entitlements.manage
revenue.read | payouts.request | payouts.approve | payouts.mark_paid
advisories.read | advisories.manage
support.read | support.manage
audit.read | audit.export
operations.read | operations.manage
```

## 4. Authentication and operator safety

The current shared `MARKETPLACE_ADMIN_TOKEN` is suitable only for bootstrap and emergency automation. It must not be placed in a browser or used as the permanent admin identity.

Required design:

- dedicated operator accounts, separate from customer and publisher identities;
- Argon2id password hashing using the existing marketplace identity standard;
- mandatory verified email and MFA for every operator;
- WebAuthn/passkeys recommended for Platform Owner, Security, and Finance roles;
- short-lived server-side sessions in `HttpOnly`, `Secure`, `SameSite=Strict` cookies;
- CSRF protection for mutations and strict origin checks;
- session inventory, remote revocation, idle timeout, absolute timeout, and re-authentication for sensitive actions;
- IP/device metadata recorded for security audit, without treating IP as an identity factor;
- rate limits and account lock/delay controls;
- no secret, private key, payment credential, password hash, token, or raw recovery code returned by an API;
- break-glass access stored offline, tested quarterly, and audited whenever used.

## 5. Functional modules and screens

### 5.1 Dashboard

- pending school plugin requests;
- submissions awaiting review and security findings by severity;
- failed builds and publication jobs;
- orders/payment/refund totals and reconciliation exceptions;
- active, expired, refunded, and revoked entitlements;
- open advisories and affected installations where knowable without school data;
- system health, queue depth, storage, database, email, payment, and signing readiness;
- operator action feed sourced from immutable audit events.

Every card links to a filtered list. Dashboard counts must come from purpose-built aggregate endpoints, not browser-side downloads of full tables.

### 5.2 Customer accounts and school installations

- search customer accounts by safe identifiers;
- view verified email, status, MFA state, linked installations, orders, and entitlements;
- view an installation's public label, installation ID, key status, core version last reported, link status, and entitlement history;
- suspend marketplace account access without disabling a school's local system;
- unlink/revoke a compromised marketplace grant;
- rotate or revoke an installation registration key through the existing signed challenge process;
- add internal notes with author, timestamp, visibility, and retention classification;
- merge or transfer ownership only through a separately reviewed recovery workflow.

### 5.3 School plugin requests

A school request is distinct from a publisher submission. It means a verified school asks Wattanam for permission, purchase assistance, private availability, or entitlement to an existing catalog plugin.

Request types:

- `FREE_APPROVAL` — plugin is free but controlled;
- `PURCHASE_ASSISTANCE` — operator prepares an invoice/order;
- `PRIVATE_PLUGIN_ACCESS` — plugin is visible only to approved installations;
- `TRIAL` — time-limited entitlement;
- `FEATURE_REQUEST` — requested plugin does not yet exist; creates product feedback, not an entitlement.

Lifecycle:

```text
DRAFT -> SUBMITTED -> UNDER_REVIEW -> NEEDS_INFORMATION
                              |              |
                              |              └──> UNDER_REVIEW
                              v
                    APPROVED / REJECTED / CANCELLED
                              |
                    order/payment if required
                              |
                       ENTITLEMENT_ISSUED
                              |
             school admin downloads, installs, activates
```

Rules:

- requests are bound to one customer account, one registered installation, and one plugin or feature description;
- the school must prove installation ownership through its marketplace link/grant;
- submission records requested plugin, business justification, intended users, desired date, and school contact; it never asks for student data;
- an approval states approver, reason, scope, price override if authorized, expiry/trial limits, and policy version;
- paid requests cannot issue an active entitlement before a settled payment or an approved manual-invoice exception;
- retrying approval or entitlement issuance is idempotent;
- rejection, cancellation, and later revocation never delete the request or its decisions;
- the school receives status notifications and can see the complete non-internal timeline;
- installation and activation remain in the local **Admin → Plugins** screen.

Admin screens:

- request queue with age, priority, type, plugin, school, risk, and assignee filters;
- request detail with public conversation, internal notes, order, entitlement, and audit timeline;
- approve, reject, request information, cancel, and issue trial actions;
- bulk assignment is allowed; bulk approval is not;
- saved queues for support, finance, and marketplace operations.

### 5.4 Plugin catalog and release management

- create/edit plugin metadata, screenshots, documentation links, categories, visibility, licence, and support status;
- define currency-specific prices and effective periods without rewriting historic order prices;
- view immutable versions, channels, compatibility, artifact hash, signing identity, download counts, and changelog;
- promote beta to stable without rebuilding;
- withdraw a release with a reason and replacement guidance;
- publish security advisories and recommended actions;
- preview the exact signed repository index before publication;
- prohibit mutation or replacement of a published artifact.

### 5.5 Plugin creation and build workspace

The first version should support **official Wattanam plugins**. Third-party publishers continue submitting locally built, signed `.wtp` files until the hosted-build threat model is separately approved.

Suggested workflow:

```text
Create plugin project
  -> generate from approved SDK template
  -> connect a dedicated Git repository and immutable commit SHA
  -> validate manifest and dependency allowlist
  -> isolated build
  -> unit/contract/static/malware/secret/licence checks
  -> produce unsigned candidate + reports + SBOM
  -> manual review
  -> signing service signs approved artifact digest
  -> publish to beta
  -> pilot installation and health evidence
  -> second-person stable promotion
```

Build security requirements:

- ephemeral worker/container or microVM with CPU, memory, process, and time limits;
- no marketplace database, admin token, signing private key, cloud credential, or production network access;
- network disabled by default; if dependency fetching is allowed, use an allowlisted proxy and lockfile;
- immutable source commit, template version, SDK version, toolchain image digest, dependency lockfile, logs, test results, SBOM, and output digest retained;
- artifact signing occurs in a separate signing service after approval; private keys are non-exportable where the hosting environment permits;
- two operators cannot satisfy a two-person rule through one shared account;
- reproducible-build comparison is required before stable publication when supported by the toolchain;
- failed and cancelled builds retain redacted evidence but never publish artifacts.

Initial builder features:

- create a Git-backed official plugin project from `packages/plugin-cli` templates;
- validate `plugin.json`, migrations, permissions, routes, navigation, and SDK compatibility;
- run `check`, tests, package verification, dependency audit, licence scan, secret scan, and SBOM generation;
- show logs safely, download reports, compare two build artifacts, and promote an approved candidate;
- do not start with an in-browser general-purpose code editor. Repository-based development preserves review, commit history, and normal developer tooling.

### 5.6 Submission and publisher governance

- publisher application list and identity evidence review;
- policy acceptance status and missing requirements;
- member roles and verified membership;
- signing-key request, second-person approval, rotation, and revocation;
- submission intake, automated analysis, reviewer assignment, decision checklist, rejection reasons, resubmission links, and SLA timers;
- enforced no-self-review and conflict-of-interest declaration;
- reviewer decisions append records and never overwrite prior decisions.

### 5.7 Commerce, entitlements, and finance

- orders and immutable order lines;
- payment state, webhook evidence, disputes, refunds, and idempotency records;
- manual invoice/reference workflow with dual control above a configured threshold;
- entitlement issue, expiry, refund, revoke, and signed-token history;
- revenue ledger, publisher statements, corrections, and payouts;
- four-eyes control for corrections and payouts;
- currency displayed in minor units using shared formatters;
- exports contain only the minimum fields required by Finance and are audit logged.

### 5.8 Support, advisories, and operations

- support cases linked to account, installation, plugin/release, order, or entitlement;
- redacted diagnostic attachments with size, type, retention, and malware controls;
- advisory impact view based on marketplace registration/download/entitlement metadata only;
- notification delivery status and safe retries;
- marketplace service health, job queues, failed jobs, and dead-letter handling;
- no arbitrary shell, SQL console, environment-secret viewer, or direct filesystem browser in the admin UI.

### 5.9 Audit and reporting

Every mutation records:

- actor account and effective role;
- action and target type/ID;
- UTC timestamp, request/correlation ID, source IP, and user agent;
- before/after field allowlists or a structured decision payload;
- reason, ticket/reference, and second approver where required;
- success, denial, or failure outcome.

Audit records are append-only to application identities. Export and audit-log reads are themselves audited. Sensitive values are redacted before persistence, not only before display.

## 6. Data model additions

Reuse existing marketplace models for accounts, sessions, publishers, submissions, reviews, installations, orders, payments, refunds, entitlements, artifacts, advisories, revenue, payouts, and audit events.

Add these central models through additive Prisma migrations:

| Model | Essential fields |
|---|---|
| `PlatformOperator` | `id`, `email`, `displayName`, `status`, timestamps |
| `PlatformRole` / `PlatformPermission` | stable keys and descriptions |
| `PlatformOperatorRole` | operator, role, scope, grantor, expiry |
| `PlatformOperatorSession` | digest only, MFA level, expiry, revoked metadata |
| `SchoolPluginRequest` | account, installation, plugin nullable, type, status, justification, assignee, requested date, timestamps |
| `SchoolPluginRequestDecision` | request, actor, decision, reason, public message, structured conditions, timestamp |
| `SchoolPluginRequestMessage` | request, author type/ID, visibility, body, timestamp |
| `PrivatePluginAccess` | plugin, installation/account scope, grantor, validity, revocation |
| `PluginProject` | publisher, repository, default branch, template and SDK versions, status |
| `PluginBuild` | project, commit SHA, toolchain digest, status, initiator, timings, output hash |
| `PluginBuildCheck` | build, check type, status, summary, report reference |
| `PluginReleaseCandidate` | build, artifact digest, review status, signer, publication linkage |
| `AdminApproval` | action type, target, requester, approver, state, expiry |
| `SupportCase` / `SupportMessage` | safe customer-support workflow and retention metadata |
| `OperatorNotification` | recipient, event, read state, delivery state |

Use enums for state machines, database uniqueness constraints for idempotency, optimistic concurrency/version fields for human-edited records, and foreign keys instead of copied identity text wherever history permits. Retain display snapshots only where financial/legal history requires them.

## 7. API design

Create a versioned `/platform/v1` API. Do not expose the existing `/admin/v1` bearer-token endpoints directly to the browser.

Minimum resource groups:

```text
/platform/v1/auth/*
/platform/v1/dashboard
/platform/v1/operators
/platform/v1/roles
/platform/v1/customers
/platform/v1/installations
/platform/v1/plugin-requests
/platform/v1/plugins
/platform/v1/plugin-projects
/platform/v1/builds
/platform/v1/release-candidates
/platform/v1/publishers
/platform/v1/submissions
/platform/v1/orders
/platform/v1/refunds
/platform/v1/entitlements
/platform/v1/revenue
/platform/v1/payouts
/platform/v1/advisories
/platform/v1/support-cases
/platform/v1/audit-events
/platform/v1/operations/health
```

API rules:

- OpenAPI is the contract source; generate the admin client's types from it;
- list endpoints use cursor pagination, bounded page sizes, stable sorting, and allowlisted filters;
- mutations accept an idempotency key and require a reason for sensitive actions;
- use `409` for stale versions/state conflicts and return the current safe state;
- return generic errors to the UI and log structured internal context;
- authorize in the API for every request; UI hiding is not authorization;
- file uploads stream to quarantine storage with size/type/hash checks;
- asynchronous operations return a job ID and expose job state/events;
- outbound notifications use an outbox so database state and notification intent commit together.

## 8. Frontend architecture

Recommended application: `apps/platform-admin`, built with Next.js and the repository's shared UI conventions, but deployed separately from every customer frontend.

Route map:

```text
/login
/mfa
/dashboard
/customers
/customers/[accountId]
/schools
/schools/[installationId]
/plugin-requests
/plugin-requests/[requestId]
/plugins
/plugins/[pluginId]
/plugins/[pluginId]/versions/[version]
/plugin-projects
/plugin-projects/[projectId]/builds/[buildId]
/submissions
/submissions/[submissionId]
/publishers
/publishers/[publisherId]
/commerce/orders
/commerce/refunds
/commerce/entitlements
/finance/revenue
/finance/payouts
/security/advisories
/support
/audit
/operations
/settings/operators
/settings/roles
```

UX requirements:

- desktop-first but usable on tablet; no essential operation depends on hover;
- Khmer and English ready, with English as the first operator release if translation capacity is limited;
- keyboard navigation, visible focus, semantic labels, and WCAG 2.2 AA target;
- confirmation dialogs show exact target, effect, reversibility, and required reason;
- destructive/high-risk actions require typed confirmation and step-up authentication, not color alone;
- clear separation between customer-visible messages and internal notes;
- filters and pagination represented in the URL;
- timestamps show local operator time plus accessible UTC detail;
- no optimistic success for finance, entitlement, signing, withdrawal, or approval actions.

## 9. Background jobs and integrations

Use the existing worker boundary or a dedicated marketplace worker for:

- build orchestration and check aggregation;
- email notifications;
- entitlement expiry sweeps;
- payment reconciliation;
- statement generation and exports;
- artifact scan/verification;
- advisory impact computation;
- audit export preparation;
- stale request reminders and SLA notifications.

Jobs require idempotent handlers, bounded retries, exponential backoff, dead-letter state, correlation IDs, and an operator-safe retry action. A retry must not duplicate orders, entitlements, refunds, releases, or payouts.

## 10. Delivery stages

### Stage PA-0 — Decisions and contracts

- approve this boundary and terminology;
- decide operator identity provider: marketplace-native initially, OIDC later, or OIDC from launch;
- define role/permission matrix and two-person action list;
- define plugin-request types, SLAs, price-override authority, and trial policy;
- define hosted-build network, retention, and signing-key custody policy;
- write OpenAPI and state-machine contracts;
- threat-model operator compromise, malicious packages, approval forgery, and cross-school access.

**Exit:** ADRs approved, API/state contracts reviewed, and no unresolved high-risk boundary question.

### Stage PA-1 — Secure admin foundation

- scaffold `apps/platform-admin`;
- add operator models, migrations, bootstrap command, login, mandatory MFA, logout, session revocation, and RBAC middleware;
- implement shared layout, navigation, error handling, correlation IDs, and audit middleware;
- leave legacy admin-token endpoints available only to server automation and begin deprecation tracking.

**Exit:** an operator can sign in with MFA, sees only permitted navigation, and unauthorized API tests fail closed.

### Stage PA-2 — Read-only operations

- dashboard aggregates;
- customer, installation, publisher, plugin/version, submission, order, entitlement, advisory, and audit list/detail screens;
- cursor pagination, filters, exports, and sensitive-field redaction;
- operations health view.

**Exit:** normal marketplace investigation needs no direct database access.

### Stage PA-3 — School plugin-request workflow

- add request models/state machine and school-facing request endpoints/UI;
- add platform queue, assignment, messages, decision controls, notifications, and audit;
- connect approval to order/manual-invoice/trial and idempotent entitlement issuance;
- expose status to the requesting school;
- retain local school installation confirmation.

**Exit:** one real registered school completes request → approval/payment rule → entitlement → local install, including rejection and retry tests.

### Stage PA-4 — Publisher and submission review

- publisher identity, policy, member, and signing-key interfaces;
- reviewer assignment, automated report rendering, decisions, and resubmission;
- enforce no-self-review and dual control in database/API transactions;
- catalog metadata and beta/stable release screens.

**Exit:** invited publisher submission can be reviewed and promoted without `curl`, while forged identity and self-review tests fail.

### Stage PA-5 — Official plugin build pipeline

- Git-backed project creation from approved templates;
- isolated build-worker queue;
- manifest/SDK/migration checks, tests, dependency/security/licence/secret scans, SBOM, and immutable evidence;
- candidate approval, separate signing operation, beta publish, pilot evidence, and stable promotion;
- cancel, retry, timeout, and worker-compromise drills.

**Exit:** an official plugin is created from template, built twice reproducibly, reviewed, signed, published to beta, installed on a disposable school, and promoted with complete provenance.

### Stage PA-6 — Commerce and finance operations

- order/payment/refund/dispute views and authorized actions;
- entitlement correction/revocation with reason and impact warning;
- revenue, statements, correction, payouts, reconciliation, exports, and dual approval;
- finance-specific audit and access reviews.

**Exit:** refund, chargeback, correction, and payout scenarios reconcile to ledger evidence without direct database edits.

### Stage PA-7 — Security, support, and production hardening

- support-case workflow, advisories, emergency withdrawal, notification delivery, and runbooks;
- SSO/passkey decision implementation if deferred;
- backup/restore, disaster recovery, audit export, retention, monitoring, alerts, rate limits, WAF/proxy rules, and penetration test;
- accessibility, browser, load, failure, and operator usability testing;
- remove or tightly firewall superseded shared-token UI operations.

**Exit:** production readiness review passes and all critical runbooks have witnessed drills.

## 11. Test strategy

Required automated layers:

- unit tests for permissions, state machines, pricing, approval, redaction, and idempotency;
- database integration tests for constraints, transactions, concurrency, outbox, and dual control;
- API contract tests generated/validated against OpenAPI;
- browser E2E for every role and critical workflow;
- negative authorization matrix: every role against every protected action;
- malicious `.wtp`, zip bomb, traversal, secret leak, dependency confusion, timeout, and resource-exhaustion build tests;
- payment webhook replay, refund race, duplicate approval, duplicate entitlement, and payout race tests;
- accessibility scans plus manual keyboard/screen-reader checks;
- backup/restore and disaster-recovery tests that include new admin and request data;
- load tests for dashboard aggregation, large audit history, request queues, and build logs.

No stage is complete based only on screenshots or mocked data. Acceptance evidence records commit, environment, commands/scenarios, expected result, actual result, and retained artifact references.

## 12. Deployment on Railway

Use a dedicated central project such as **Wattanam Marketplace**, never a customer-school project.

Recommended services:

```text
platform-admin-web       public HTTPS
marketplace-api          private from web; public only for required customer/repository endpoints
marketplace-worker       private
plugin-build-orchestrator private; no signing key
postgresql               private
redis/queue              private
artifact storage         persistent volume or supported object storage
quarantine storage       separate from published artifacts
signing service          private, tightly restricted; ideally external KMS/HSM-backed
monitoring/alerts        restricted
```

The admin web uses an internal marketplace API URL when Railway private networking supports the path. Public ingress must have an explicit allowlist of routes, rate limits, TLS, security headers, and separate admin/customer origins. Preview deployments use separate databases, storage, credentials, and signing keys and can never promote into production.

## 13. Migration from current implementation

1. Keep existing marketplace behavior operational.
2. Add operator identity/RBAC beside existing customer/publisher identity.
3. wrap current `RepositoryService`, `PublisherGovernanceService`, and commerce operations with actor-aware platform application services instead of duplicating their business logic;
4. add read/list endpoints currently missing from the mostly command-oriented admin API;
5. migrate one UI workflow at a time and compare audit/state results with existing operational commands;
6. restrict `MARKETPLACE_ADMIN_TOKEN` to bootstrap, CI, and documented break-glass automation;
7. rotate the token after browser workflows are removed and verify no frontend bundle or log contains it.

Do not rewrite the marketplace API or database in one migration. Preserve current signed artifacts, releases, orders, entitlements, publisher history, and audit evidence.

## 14. Definition of done

The platform admin is complete only when:

- every supported operator action is authenticated to a named person and authorized server-side;
- platform and school admin boundaries are documented, tested, and visible in the UI;
- a school plugin request completes end-to-end without direct DB access or shared admin tokens;
- official plugin creation/build/review/sign/publish is isolated and produces immutable provenance;
- third-party submission, publisher key approval, and no-self-review controls work through the UI;
- all commerce, refund, entitlement, revenue, and payout paths reconcile and are auditable;
- high-risk actions have reason capture, step-up MFA, and required second approval;
- backups restore operator, request, review, commerce, and audit state;
- monitoring and alerts cover API, web, workers, queues, database, storage, signing, email, and payments;
- browser E2E, authorization matrix, accessibility, security, recovery, and load gates pass in hosted CI;
- operational, support, security, finance, privacy, and legal owners sign the release checklist.

## 15. First coding slice

Start with the smallest vertical slice that proves the boundary:

1. create `PlatformOperator`, role, permission, session, and audit migrations;
2. implement an offline bootstrap command for the first Platform Owner;
3. add operator login + MFA and `/platform/v1/me`;
4. scaffold `apps/platform-admin` with protected layout and permission-aware navigation;
5. implement read-only dashboard, plugin list, installation list, and audit list;
6. add authorization matrix and browser smoke tests;
7. deploy to a non-production Railway marketplace environment and perform a restore drill.

Only after that foundation passes should implementation begin on plugin-request mutations or hosted builds.

## Related architecture

- [Wattanam V2 Platform Architecture](../platform-architecture.md)
- [Platform Architecture: A-to-Z Delivery Plan](../platform-architecture-plan-a-to-z.md)
- [Official Marketplace Repository](./official-repository.md)
- [Core/Plugin/Shared Module Boundaries](../architecture/module-boundaries.md)
- [Plugin Package and Runtime](../plugins/package-and-runtime.md)
- [Publisher Support and Escalation](./publisher-support-and-escalation.md)
- [Payment Adapter ADR](../architecture/adr/0007-payment-adapter.md)
- [Threat Model](../architecture/threat-model.md)
