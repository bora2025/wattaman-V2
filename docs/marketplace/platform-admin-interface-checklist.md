# Platform Admin Interface — Start-of-Implementation Checklist

Source plan: [platform-admin-interface-plan.md](./platform-admin-interface-plan.md). Implementation
is active: PA-1 is complete, PA-2 awaits hosted verification, and PA-3 is underway. Section 10 of
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
- [x] **PO0-3** (PO/Sec) Operator identity provider: **marketplace-native accounts**, matching the
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
- [~] **PA2-3** (BE/FE) CSV exports — bounded, formula-injection-safe export service with audit
      recording, strict proxy forwarding, and operator download screen are implemented; focused
      service tests cover audit-before-read, the row cap, masking, and formula defusing. Browser
      download evidence remains
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
- [ ] **PA2-6** (QA) Complete authorization matrix, browser E2E, accessibility, and hosted
      non-production evidence for the expanded read surface. **In progress:** the generated
      OpenAPI permission metadata now drives a deny-by-default matrix across all 9 seeded roles
      and every documented protected PA-2 route; it also fails if a route names an unseeded or
      wholly unassigned permission. Browser, accessibility, and hosted evidence remain

**PA-2 exit:** normal marketplace investigation needs no direct database access.

## Stage PA-3 — School plugin-request workflow

- [x] **PA3-1** (PO/Sec) Request policy approved — five request types, business-day SLA targets,
      30-day/annual trial rules, discount authority, and dual-control exceptions are binding
      ([decision](../decisions/platform-admin-policy-decisions-2026-08-31.md))
- [x] **PA3-2** (DB) Additive request schema and migration — requests, immutable idempotent
      decisions, public/internal messages, assignments, SLA timestamps, ownership relations, and
      database-enforced exactly-one message author
- [x] **PA3-3** (BE) Customer request creation/list API — verified account and installation
      ownership required, approved catalog plugin required except for feature requests, annual
      trial uniqueness enforced, and internal reasons/messages excluded from customer queries
- [~] **PA3-4** (BE) Operator workflow API — filtered queue, detail, assignment, start-review,
      request-information, approval, and rejection transitions are serializable, idempotent, and
      audited. Customer information-response/cancellation and entitlement fulfilment remain
- [x] **PA3-5** (FE) Platform operator queue/detail — URL filters, SLA visibility, assignment,
      review, information request, approve/reject controls, and complete internal decision timeline
- [x] **PA3-6** (FE) Customer marketplace request surface — linked schools can submit all five
      request types and track their customer-safe status timeline; UI explicitly preserves local
      school installation control
- [ ] **PA3-7** (BE) Connect approved free/trial/private requests to idempotent entitlement
      issuance and purchase assistance to order/manual-invoice state; enforce dual approval for
      paid exceptions and grants longer than 90 days
- [ ] **PA3-8** (QA/SRE) Live PostgreSQL migration/concurrency/retry drill, browser end-to-end for
      request/approval/rejection/information/payment/entitlement/local-install paths, notifications,
      accessibility, and hosted Railway evidence

**PA-3 exit:** a registered school completes request → approval/payment rule → entitlement → local
install, including rejection and retry tests.

## What comes after PA-3

Stages PA-4 through PA-7 (publisher/submission review, the official-plugin build pipeline, commerce/finance operations, and
security/support/production hardening) are fully specified in the source plan's §10 but
deliberately **not** broken into checklist items here — each is large enough to deserve its own
checklist once PA-0/PA-1 are actually done, not planned in advance of proof that the foundation
works. Revisit this file to add a "Stage PA-2" section once PA-1's exit criteria are met.
