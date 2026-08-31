# Platform Admin Interface — Start-of-Implementation Checklist

Source plan: [platform-admin-interface-plan.md](./platform-admin-interface-plan.md) (status:
planned, implementation not started as of 2026-08-31). That document's Section 10 defines the full
PA-0 → PA-7 delivery program; this checklist operationalizes only what's needed to **start**
coding — Stage PA-0 (decisions that gate everything else) and Stage PA-1 / Section 15's first
vertical slice. Do not begin PA-2 or later until every item below is checked and PA-1's exit
criteria (bottom of this file) is demonstrably true, not just believed true.

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
- [ ] **PA0-4** (PO/Sec) Approve the two-person-approval action list (payouts, publisher key
      approval, revenue corrections, and any others identified) — plan §3/§5.7 name several but the
      complete list must be explicit before `AdminApproval` (plan §6) is modeled. **Blocks PA-6**,
      not PA-1
- [ ] **PA0-5** (PO) Define school plugin-request types, SLA targets per type, price-override
      authority, and trial policy (plan §5.3). **Blocks PA-3**, not PA-1
- [ ] **PA0-6** (PO/Sec) Define the hosted-build network policy, evidence-retention duration, and
      signing-key custody policy (plan §5.5). **Blocks PA-5**, not PA-1
- [x] **PA0-7** (PL) PA-1 API contract defined and implemented: `POST /platform/v1/auth/sessions`,
      `/auth/sessions/refresh`, `/auth/sessions/revoke`, `/auth/mfa/enroll`,
      `/auth/mfa/enroll/confirm`, `GET /platform/v1/me`. A generated OpenAPI document is still
      owed (plan §7 wants OpenAPI as the contract source) — tracked as a PA-2 prerequisite
- [x] **PA0-8** (Sec) PA-1 threat model applied in code: deny-by-default authorization on every
      route, mandatory MFA before any non-enrollment action, opaque session tokens hashed at rest
      with rotation + reuse detection, exponential lockout, suspended-operator sessions rejected
      mid-life, and the browser never holding a session token. Each is covered by a live check in
      the two drills below

**Exit:** PA0-1/2/3/7/8 closed as above; PA0-4/5/6 remain open against their own later stages.

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

- [~] **PA2-1** (BE) Read-only directory and commerce APIs — customer, installation, publisher,
      plugin, submission, order, entitlement, advisory, and operations-health list/detail services
      are implemented and compile; focused service/API contract tests remain
- [~] **PA2-2** (FE) Operator list screens — customers, publishers, submissions, orders,
      entitlements, advisories, and operations health are permission-filtered in navigation and
      available through the strict proxy allowlist; customer, school, publisher, plugin,
      submission, and order detail routes are live in the production build. URL filters remain
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

## What comes after PA-2

Stages PA-3 through PA-7 (school plugin-request workflow,
publisher/submission review, the official-plugin build pipeline, commerce/finance operations, and
security/support/production hardening) are fully specified in the source plan's §10 but
deliberately **not** broken into checklist items here — each is large enough to deserve its own
checklist once PA-0/PA-1 are actually done, not planned in advance of proof that the foundation
works. Revisit this file to add a "Stage PA-2" section once PA-1's exit criteria are met.
