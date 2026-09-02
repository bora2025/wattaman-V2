# Platform Admin Interface — Implementation and Acceptance Checklist

Source plan: [platform-admin-interface-plan.md](./platform-admin-interface-plan.md). Implementation
is active: PA-0 and PA-1 are complete; PA-2 and PA-3 are partial; PA-4 through PA-7 have not
started. Section 10 of
the source plan defines the full PA-0 → PA-7 delivery program; this checklist is the evidence-backed
execution record for each stage.

Checkbox convention matches [completion-checklist.md](../completion-checklist.md): `[ ]` open,
`[x]` done with evidence linked in the same line — no item is checked from intent or a plan
description alone.

## Stage PA-0 — Decisions and contracts (blocks all coding)

These are Product/Owner/Security decisions, not engineering tasks. Nothing in PA-1 should start
until they're answered, because the plan's own design (permission model, operator identity,
two-person-approval list, API contracts) depends on the answers.

PA0-1/2/3/7/8 were resolved by adopting the plan's own stated positions as-is (the engineering
decision was "implement what §2/§3/§4 already specify, don't deviate") and are reflected directly
in the shipped PA-1 code. PA0-4/5/6 are genuinely deferred: each gates a *later* stage
(PA-6, PA-3, PA-5 respectively) and none of them constrains PA-1's foundation, so blocking on them
would have stalled the slice for no engineering benefit. They must still be answered before their
own stages start.

- [x] **PA0-1** (PO) Non-negotiable boundaries in plan §2 adopted as binding — the shipped
      `/platform/v1` API reads only marketplace-owned models; `PlatformReadService.installations()`
      exposes registration/link/entitlement metadata and nothing from any school's own database
- [x] **PA0-2** (PO) Persona/permission model in plan §3 adopted as specified — 9 roles and 36
      permission keys seeded in `platform-rbac-seed.ts`, deny-by-default, no universal admin role
      (live-proven: Platform Owner itself is denied `plugins.read`/`schools.read`)
- [x] **PA0-3** (PO/Sec) Operator identity provider: **marketplace-native accounts**, matching the
      plan's stated default. OIDC/passkeys remain a PA-7 decision, unblocked by this choice
- [x] **PA0-4** (PO/Sec) Two-person action list approved — publisher identity/key actions,
      stable third-party/core promotion, revenue corrections, payouts, high-value refunds,
      exceptional manual entitlements, and production trust-key removal require a different
      initiator and approver; emergency withdrawal has a one-business-day retrospective review
- [x] **PA0-5** (PO) School plugin-request policy approved — all five request types, 1–3 business
      day response/decision targets, 30-day trials, one trial per school/plugin/year, 10% Finance
      discount authority, dual approval above 10%, and no below-floor pricing
- [x] **PA0-6** (PO/Sec) Hosted-build policy approved — disposable network-denied workers,
      allowlisted dependency proxy, bounded resources, tiered 90-day/1-year/release+7-year
      evidence retention, and signing in a separate non-exportable KMS/HSM-backed service
      ([decision record](../decisions/platform-admin-policy-decisions-2026-08-31.md))
- [x] **PA0-7** (PL) PA-1 API contract defined and implemented: `POST /platform/v1/auth/sessions`,
      `/auth/sessions/refresh`, `/auth/sessions/revoke`, `/auth/mfa/enroll`,
      `/auth/mfa/enroll/confirm`, `GET /platform/v1/me`. A generated OpenAPI document is still
      owed (plan §7 wants OpenAPI as the contract source) — tracked as a PA-2 prerequisite
- [x] **PA0-8** (Sec) PA-1 threat model applied in code: deny-by-default authorization on every
      route, mandatory MFA before any non-enrollment action, opaque session tokens hashed at rest
      with rotation + reuse detection, exponential lockout, suspended-operator sessions rejected
      mid-life, and the browser never holding a session token. Each is covered by a live check in
      the two drills below

**Exit:** all PA-0 decisions are approved; later implementation must conform to the linked policy.

## Stage PA-1 first slice — Secure admin foundation

This is plan §15's "first coding slice," broken into concrete, independently-verifiable steps.
Each should ship as its own reviewed change, matching this repo's established one-package-at-a-time
discipline — do not batch all of PA-1 into one unreviewable diff.

### Data model and bootstrap

- [x] **PA1-1** (BE) `PlatformOperator`, `PlatformRole`, `PlatformPermission`,
      `PlatformRolePermission`, `PlatformOperatorRole`, `PlatformOperatorSession`, and
      `PlatformOperatorMfaRecoveryCode` added as one additive migration
      (`20260831142436_platform_admin_operators`). **Plan correction:** §4 calls for "Argon2id
      using the existing marketplace identity standard", but that standard is actually **scrypt**
      (`identity-crypto.ts`) — reused scrypt rather than adding a third hashing scheme to a repo
      that already has bcrypt (school) and scrypt (marketplace)
- [x] **PA1-2** (BE) `PlatformAuditEvent` added as a distinct model from `MarketplaceAuditEvent`
      (operator actions are a separate identity class), carrying actor, action, target type/id,
      reason, correlation id, IP, user agent, and success/failure outcome per plan §5.9
- [x] **PA1-3** (BE) `scripts/bootstrap-platform-owner.ts` — CLI only, no HTTP endpoint exists to
      create operators. Reads the password from env or `--password-file`, never argv; refuses to
      overwrite an existing operator; writes a `platform_operator_bootstrapped` audit row
- [x] **PA1-4** (Sec) All 36 permission keys and 9 roles from plan §3 seeded idempotently
      (`platform-rbac-seed.ts`), including namespaces later stages will need, so no breaking
      migration is required to start granting them

### Auth and session safety

- [x] **PA1-5** (BE) Login + **mandatory** MFA: an operator who has never enrolled receives a
      30-minute enrollment-only session that can reach nothing but the two enrollment routes;
      confirming enrollment upgrades that same session in place. Session tokens are opaque, stored
      only as a digest, and rotate with reuse detection (reusing a rotated token revokes every
      session for that operator), matching `identity.service.ts`'s existing precedent
- [x] **PA1-6** (BE) `GET /platform/v1/me` — identity, granted roles, and effective permission set
- [x] **PA1-7** (BE) `requirePlatformSession` + `requirePlatformPermission` middleware,
      deny-by-default, permissions resolved fresh per request so a revoked role takes effect
      immediately rather than at session expiry
- [x] **PA1-8** (BE/FE) Strict same-origin check on every mutating proxy route; session cookie is
      `HttpOnly` + `SameSite=Strict` + `Secure` in production
- [x] **PA1-9** (BE) Session revocation implemented (`/auth/sessions/revoke`), absolute timeout via
      session expiry (12h verified / 30m enrollment), and suspended operators rejected mid-session.
      A full session *inventory* UI (list/revoke another device) is deferred to PA-2 with the rest
      of the operator-management screens

### Frontend scaffold

- [x] **PA1-10** (FE) `apps/platform-admin` scaffolded as a genuinely separate Next.js app —
      deliberately lean (Next + React + Tailwind only), not a route bolted onto the school frontend
      or the customer portal
- [x] **PA1-11** (FE) `/login` (with the full credentials → MFA → enrollment journey and a
      one-time recovery-code screen), protected operator shell, and permission-filtered navigation
      driven by the real `/me` permission set
- [x] **PA1-12** (FE) Correlation-ID propagation: the browser generates one id per action, the
      proxy forwards it, and the API stores it on the audit row with client IP and user agent.
      Requests arriving without an id get a generated one, so no audit row is uncorrelated.
      Live-verified: a client-supplied id appears verbatim on the resulting audit row

### Read-only proof surface (smallest useful slice of PA-2, pulled forward to prove the boundary)

- [x] **PA1-13** (BE/FE) `GET /platform/v1/dashboard` returns nine purpose-built aggregate counts
      (catalog, schools, commerce, security, platform) — server-side `count()` queries, never a
      browser-side table download; rendered as a grouped card grid
- [x] **PA1-14** (BE/FE) Cursor-paginated plugin, installation, and audit-event lists behind
      `plugins.read` / `schools.read` / `audit.read`. Installation rows mask the linked account's
      email rather than exposing it in full

### Verification

- [x] **PA1-15** (QA) Authorization matrix drill, **12/12 passed** against live PostgreSQL 16:
      three roles (`marketplace_operator`, `auditor`, `customer_support`) each checked against
      every PA-1 route, plus session revocation and mid-session suspension. Also proved the
      headline deny-by-default property — Platform Owner itself is refused `plugins.read` and
      `schools.read`, exactly as plan §3 intends
- [x] **PA1-16** (QA) Browser-equivalent smoke test through the app's own proxy, **20/20 passed**:
      login returns no token in the response body, the cookie is `HttpOnly`/`SameSite=Strict`,
      everything is blocked until MFA enrollment completes, real TOTP enrollment upgrades the
      session, role-scoped routes allow/deny correctly, an unlisted upstream route is unreachable
      through the proxy, and sign-out clears both cookie and server session
- [x] **PA1-17** (SRE) Deployed to an isolated non-production Railway project (**Wattanam
      Platform Admin Staging**) with its own Postgres, its own signing keys, and no path to
      promote into production, per plan §12. `platform-admin-web` talks to `marketplace-api` over
      Railway private networking; only the web service is public. Restore drill **13/13**: all
      seven new tables' row counts match after restoring into a fresh database, the owner's
      password hash and MFA secret survive byte-for-byte, effective RBAC permissions still
      resolve, and no grant/session/audit row is orphaned

Two real bugs were found by deploying rather than by local testing, both now fixed:
**(1)** every browser POST was rejected as cross-origin behind Railway's proxy, because the CSRF
check compared `Origin` against `nextUrl.origin` (the internal listener, never the public URL) —
sign-in was impossible in any deployed environment while working perfectly on localhost. The same
bug existed in the school frontend's marketplace proxy and would have broken the customer portal's
login/checkout and the marketplace-link approval flow, so it was fixed there too.
**(2)** the first restore drill reported the operator MFA secret restoring as plaintext; that
turned out to be the drill running in development mode with no encryption keyring, not a storage
defect — re-run under `NODE_ENV=production` the secret persists as an `enc:v1:<keyId>:…` envelope
and a subsequent TOTP login still authenticates.

**PA-1 exit (from the plan, verbatim):** *"an operator can sign in with MFA, sees only permitted
navigation, and unauthorized API tests fail closed."* Treat PA1-15/16/17 as the literal evidence
for this — not implied by the feature list being complete.

## Stage PA-2 — Read-only operations expansion

**2026-09-02 re-audit:** marketplace API tests pass **176/176** across 25 suites, and both the
marketplace API and platform-admin production builds pass. These local results support the checked
implementation items but do not substitute for PA2-3's browser download or PA2-6's hosted,
browser, and accessibility evidence.

- [x] **PA2-1** (BE) Read-only directory and commerce APIs — customer, installation, publisher,
      plugin, submission, order, entitlement, advisory, and operations-health list/detail services
      are implemented and compile; focused service tests verify masked identities, marketplace-only
      school metadata, integer minor-unit money, 404 detail behavior, and exclusion of credential
      and signed-entitlement material at the Prisma query boundary
- [x] **PA2-2** (FE) Operator list screens — customers, publishers, submissions, orders,
      entitlements, advisories, and operations health are permission-filtered in navigation and
      available through the strict proxy allowlist; customer, school, publisher, plugin,
      submission, and order detail routes are live in the production build. Supported queue
      filters are server-side and persisted in the URL for refresh/bookmark/share behavior
- [x] **PA2-3** (BE/FE) CSV exports — bounded, formula-injection-safe export service with audit
      recording, strict proxy forwarding, and operator download screen are implemented; focused
      service tests cover audit-before-read, the row cap, masking, and formula defusing. Browser
      download evidence is now recorded: all four exports download through Chromium with masked
      addresses, a seeded `=SUM(1+1)` school label arrives quoted and apostrophe-prefixed, and the
      download writes a `platform_export` audit row naming the operator
      ([evidence](../acceptance/platform-admin-browser-e2e-2026-09-02.md))
- [x] **PA2-4** (BE/FE) Operator/session inventory and role-management read screens — operator
      list/detail routes expose active grants and bounded session metadata, while Prisma select
      lists exclude password hashes, MFA secrets, recovery-code hashes, and session token hashes;
      the separate role screen shows all seeded permissions and grant counts. Three focused safety
      tests pass
- [x] **PA2-5** (PL) Generate and validate the `/platform/v1` OpenAPI contract —
      `GET /platform/v1/openapi.json` serves an OpenAPI 3.1 document covering every current
      operator route, default opaque-bearer authentication, the two intentionally public auth
      routes, required permission metadata, and the CSV media type. Four contract tests prevent
      authentication/permission/media-type drift
- [~] **PA2-6** (QA) Complete authorization matrix, browser E2E, accessibility, and hosted
      non-production evidence for the expanded read surface. The generated OpenAPI permission
      metadata drives a deny-by-default matrix across all 9 seeded roles and every documented
      protected PA-2 route, failing if a route names an unseeded or wholly unassigned permission.
      A Playwright harness (`npm run e2e`) now adds browser evidence on a stack built from
      migrations on disposable PostgreSQL 16: **52/52 passing**, covering per-identity navigation
      equality, every denial asserted at both the screen and the API for the operator's own
      browser session, masked identifiers, operator-initiated password rotation, and zero axe-core
      WCAG 2.1 A/AA violations across 16 screens
      ([evidence](../acceptance/platform-admin-browser-e2e-2026-09-02.md)). **Isolated Railway
      non-production evidence remains**

Two defects were found by the browser harness rather than by any local test, both now fixed:
**(1)** `prisma migrate deploy` could not build a marketplace database from scratch — the two PA-3
migrations `20260831170000_school_plugin_requests` and `20260902010000_plugin_request_fulfillment`
declared `UUID` foreign-key columns against `TEXT` primary keys, so PostgreSQL rejected
`SchoolPluginRequest_accountId_fkey` outright. Because the failure is at provisioning time, those
migrations can never have applied anywhere, and a new marketplace deployment would not have come
up. **(2)** `text-slate-400` carried real meaning — unlinked school, system audit actor, empty
detail field, signed-in operator's roles — at ≈2.6:1 contrast, a serious WCAG AA failure on all
fifteen screens scanned; raised to `text-slate-500` (≈4.76:1).

**PA-2 exit:** normal marketplace investigation needs no direct database access.

## Stage PA-3 — School plugin-request workflow

**2026-09-02 re-audit:** request API/UI and ordinary entitlement/order fulfilment remain covered
by the passing 176-test marketplace suite and production builds. The exceptional dual-approval
grant now has browser evidence against a real stack
([evidence](../acceptance/platform-admin-browser-e2e-2026-09-02.md)); the complete
registered-school hosted journey does not, so PA3-8 remains partial.

- [x] **PA3-1** (PO/Sec) Request policy approved — five request types, business-day SLA targets,
      30-day/annual trial rules, discount authority, and dual-control exceptions are binding
      ([decision](../decisions/platform-admin-policy-decisions-2026-08-31.md))
- [x] **PA3-2** (DB) Additive request schema and migration — requests, immutable idempotent
      decisions, public/internal messages, assignments, SLA timestamps, ownership relations, and
      database-enforced exactly-one message author
- [x] **PA3-3** (BE) Customer request creation/list API — verified account and installation
      ownership required, approved catalog plugin required except for feature requests, annual
      trial uniqueness enforced, and internal reasons/messages excluded from customer queries
- [x] **PA3-4** (BE) Request workflow API — filtered operator queue, detail, assignment, start-review,
      request-information, approval, and rejection transitions are serializable, idempotent, and
      audited; customers can answer only their own `NEEDS_INFORMATION` request with replay-safe
      messages and cancel only their own non-terminal request, with both actions audited
- [x] **PA3-5** (FE) Platform operator queue/detail — URL filters, SLA visibility, assignment,
      review, information request, approve/reject controls, and complete internal decision timeline
- [x] **PA3-6** (FE) Customer marketplace request surface — linked schools can submit all five
      request types and track their customer-safe status timeline; UI explicitly preserves local
      school installation control
- [x] **PA3-7** (BE) Fulfilment — approved free/private-free requests and 30-day trials issue
      signed installation-bound entitlements idempotently; purchase assistance creates one
      immutable pending order and verified manual/webhook settlement atomically issues the
      entitlement and closes the linked request. Paid plugins cannot use the free/private path,
      feature requests cannot issue licences, existing terminal entitlements fail closed, and
      every token records that local installation remains required. Exceptional unpaid access to
      a paid plugin or validity over the ordinary 90-day ceiling now uses an additive proposal
      record with database-enforced distinct initiator/decider identities and consistent decision
      state; the strict platform proxy, OpenAPI permission contract, and operator UI expose propose,
      approve, and reject actions. Focused self-approval/idempotency/approved-duration tests pass in
      the **178/178** marketplace suite
- [~] **PA3-8** (QA/SRE) Live PostgreSQL migration/concurrency/retry drill, browser end-to-end for
      request/approval/rejection/information/payment/entitlement/local-install paths, notifications,
      accessibility, and hosted Railway evidence. **Done:** the migration drill now runs from an
      empty schema on every suite run — which is how the `UUID`/`TEXT` foreign-key defect below was
      found — plus browser end-to-end for queue → assign → review → approve → entitlement and for
      the two-person exceptional grant, with the proposer refused at both the screen and the API,
      and accessibility on the request queue and detail screens
      ([evidence](../acceptance/platform-admin-browser-e2e-2026-09-02.md)). **Remaining:**
      concurrency/retry drills, information-request and rejection paths, notifications,
      school-side local install, and hosted Railway evidence

**PA-3 exit:** a registered school completes request → approval/payment rule → entitlement → local
install, including rejection and retry tests.

## Stage PA-4 — Publisher and submission review

- [~] **PA4-1** (DB) Additive reviewer-assignment and approval schema supports publisher identity,
      membership, policy acceptance, signing-key approval/revocation, submission review,
      resubmission, catalog metadata, and beta/stable promotion without rewriting existing history.
      Existing governance models/migration cover the foundation; explicit platform reviewer
      assignment, resubmission linkage, and promotion approvals remain
- [~] **PA4-2** (BE/Sec) Actor-aware publisher and signing-key services enforce verified identity,
      immutable policy acceptance, key ownership proof, reason capture, no-self-review, and distinct
      initiator/approver controls inside serializable transactions. Existing governance enforces
      verified-email/MFA identity, two-person publisher/key controls, policy acceptance, and
      no-self-review, but still uses publisher/customer actors and lacks uniform platform audit,
      reason, correlation, and step-up enforcement
- [~] **PA4-3** (BE) Submission workflow exposes assignment, automated evidence, reviewer findings,
      request-changes, rejection, approval, resubmission, beta publication, and stable promotion as
      idempotent `/platform/v1` operations with optimistic conflict handling. Signed intake,
      automated analysis, approve/reject, risk-based dual review, and publication exist on legacy
      routes; the missing workflow states and named-operator mutation routes remain
- [~] **PA4-4** (FE) Publisher, member, key, submission, review, catalog-metadata, and release-channel
      screens are permission-aware, keyboard operable, URL-addressable, and show a complete audit
      timeline and pending second-approval state. Read-only publisher/submission screens build;
      mutation, pending-approval, audit timeline, and accessibility work remains
- [~] **PA4-5** (Sec/QA) Forged publisher identity, revoked/unapproved key, self-review, duplicate
      approval, approval replay, altered artifact, and cross-publisher access tests fail closed.
      Current package/governance tests cover altered and cross-publisher packages, self-approval,
      publisher dual approval, submission self-review, and risky dual review; the complete operator
      replay/cross-publisher matrix and hosted browser proof remain
- [ ] **PA4-6** (QA/SRE) An invited publisher completes onboarding → signed submission → independent
      review → beta promotion → stable promotion in hosted CI without `curl`, shared tokens, or
      direct database access; retained evidence records commit, actors, artifact hashes, and results

**PA-4 exit:** an invited publisher submission can be reviewed and promoted without `curl`, while
forged identity and self-review tests fail.

## Stage PA-5 — Official plugin build pipeline

- [ ] **PA5-1** (DB/BE) Project, build, immutable evidence, approval, signing, publication, and pilot
      models/state machines are additive, idempotent, and preserve source commit plus input/output
      artifact digests
- [ ] **PA5-2** (PL) Approved SDK-versioned templates create Git-backed official plugin projects
      with manifest, migrations, tests, ownership, licence, and release metadata validated before
      the first build is queued
- [ ] **PA5-3** (Sec/SRE) Disposable build workers run without general network access or signing
      keys, use an allowlisted dependency proxy, enforce CPU/memory/time/output limits, destroy the
      workspace after use, and quarantine failures
- [ ] **PA5-4** (PL/Sec) Build gates include manifest/SDK/migration checks, unit/integration tests,
      dependency and licence policy, secret scanning, vulnerability analysis, malicious-package
      checks, SBOM generation, and reproducibility comparison
- [ ] **PA5-5** (BE/Sec) Candidate approval and signing are separate operations and identities;
      only the restricted signing service can access the non-exportable key, and every signed
      envelope binds artifact, evidence, source, builder, reviewer, and key identifiers
- [ ] **PA5-6** (FE) Project, source, build queue/log/evidence, review, signing, beta pilot, retry,
      cancellation, and stable-promotion screens expose safe bounded output and actionable failures
- [ ] **PA5-7** (QA/SRE) Hosted drills prove two reproducible builds, timeout/cancel/retry,
      compromised-worker containment, beta installation on a disposable school, rollback, and
      stable promotion with complete retained provenance

**PA-5 exit:** an official plugin is created from a template, built twice reproducibly, reviewed,
signed, published to beta, installed on a disposable school, and promoted with complete provenance.

## Stage PA-6 — Commerce and finance operations

- [ ] **PA6-1** (DB/BE) Order, payment, refund, dispute, entitlement correction/revocation, revenue,
      statement, reconciliation, and payout state transitions are immutable-ledger based,
      idempotent, and prohibit destructive financial edits
- [ ] **PA6-2** (BE/Sec) Refunds, high-value refunds, revenue corrections, exceptional entitlements,
      and payouts enforce documented authority thresholds, reason and evidence capture, step-up MFA,
      and a different second approver where policy requires it
- [ ] **PA6-3** (BE) Provider webhooks and operator actions tolerate replay, reordering, timeout,
      duplicate delivery, refund/payment races, chargebacks, and retry without duplicating money,
      entitlement, revenue, or payout effects
- [ ] **PA6-4** (FE) Finance screens cover order/payment/refund/dispute investigation, entitlement
      impact preview, revenue ledger, statements, corrections, reconciliation, payout batches,
      approvals, exports, and immutable audit history using integer minor-unit amounts
- [ ] **PA6-5** (QA) Automated finance scenarios reconcile gross, tax, fee, refund, dispute, net
      revenue, publisher share, correction, and payout totals; authorization tests cover every
      finance role/action pair and sensitive exports
- [ ] **PA6-6** (QA/SRE/Finance) Sandbox and hosted drills complete sale, failed payment, webhook
      replay, partial/full refund, chargeback, correction, entitlement revocation, payout approval,
      payout failure/retry, statement export, and ledger reconciliation without database edits

**PA-6 exit:** refund, chargeback, correction, and payout scenarios reconcile to ledger evidence
without direct database edits.

## Stage PA-7 — Security, support, and production hardening

**2026-09-02 re-audit:** reusable foundations exist, but none proves PA-7's whole-system production
exit. Advisory/withdrawal primitives and runbooks support PA7-1; PA1 staging supports part of
PA7-3; metrics, structured logs, and alert rules support part of PA7-4; operator/repository restore
drills support part of PA7-5; authorization tests support part of PA7-6; HttpOnly operator sessions
support part of PA7-7; and draft policies/runbooks support part of PA7-8. Hosted delivery,
all-domain recovery, accessibility/load/security tests, shared-token retirement, named approvals,
and witnessed production-readiness evidence remain. PA7-2 has not started.

- [~] **PA7-1** (BE/FE) Support cases, advisories, emergency withdrawal, customer communication,
      notification delivery/retry, incident links, ownership, SLA, and resolution workflows are
      implemented with complete operator/customer-safe timelines
- [ ] **PA7-2** (Sec/PO) The deferred OIDC/SSO/passkey decision is recorded and implemented;
      privileged actions require recent step-up authentication, session/device inventory works,
      and periodic access review removes stale operators and grants
- [~] **PA7-3** (SRE) Production topology deploys isolated web/API/worker/build/signing/storage/
      quarantine/database/queue boundaries with least-privilege secrets, TLS, rate limits,
      security headers, explicit ingress, WAF/proxy rules, and key rotation procedures
- [~] **PA7-4** (SRE) Metrics, structured logs, traces, queue/dead-letter visibility, dashboards,
      and delivered alerts cover web, API, workers, builds, database, storage, signing, email,
      payments, entitlement failures, SLA breaches, and suspicious operator activity
- [~] **PA7-5** (SRE/QA) Encrypted backup, point-in-time recovery, full restore, regional/disaster
      recovery, signing/repository recovery, and upgrade/rollback drills restore and verify operator,
      request, review, build, commerce, support, and audit state to approved RPO/RTO targets
- [~] **PA7-6** (QA/Sec) Hosted CI passes every-role browser E2E, full authorization matrix,
      accessibility plus manual keyboard/screen-reader review, load/soak/failure tests, dependency
      and container scans, secret detection, SAST/DAST, and independent penetration testing
- [~] **PA7-7** (Sec/SRE) Superseded shared-token UI paths are removed or restricted to documented
      break-glass automation, tokens and trust keys are rotated, and repository/bundle/log scans
      prove no browser-accessible secret remains
- [~] **PA7-8** (PO/Legal/Finance/Sec/SRE) Versioned runbooks, privacy/retention records, terms,
      publisher/customer policies, support ownership, incident contacts, finance controls, and the
      release checklist receive named owner approval with unresolved critical findings at zero

**PA-7 exit:** the production-readiness review passes and all critical runbooks have witnessed
drills.

## Whole-program completion gate

The platform admin is complete only when every PA-0 through PA-7 item is `[x]`, every stage exit
has a linked acceptance record, and every requirement in the source plan's §14 definition of done
is mapped to at least one retained test or witnessed drill. Partial (`[~]`) items do not count as
complete. Hosted, provider, legal, finance, security-review, and witnessed-drill requirements may
not be checked from local mocks or code review alone.

## Completion sequence for PA-2, PA-3, PA-4, and PA-7

1. **PA2-3 is closed** and PA2-6 needs only isolated Railway evidence: browser CSV download,
   every-role read journeys, and accessibility are covered by `apps/platform-admin` `npm run e2e`.
   Extend that harness rather than building a second one.
2. PA3's exceptional grant proposal and different-operator approval now have browser evidence. Still
   needed for PA3-8: notifications, and a registered-school request → approval/payment →
   entitlement → local-install drill including information, rejection, concurrency, replay, and
   retry.
3. Move publisher-governance mutations behind named-operator `/platform/v1` services; add
   assignment, request-changes, resubmission, beta/stable promotion, platform audit, and operator
   UI; then execute the invited-publisher hosted workflow to close PA-4.
4. Complete PA-5 and PA-6 before PA-7's final recovery, monitoring, load, security, legal, and
   release gates, because PA-7 evidence must include build and finance state.
5. Close PA-7 only after witnessed production-readiness drills and named owner approvals. PA1
   staging and local tests are supporting evidence, not a substitute for this exit.
