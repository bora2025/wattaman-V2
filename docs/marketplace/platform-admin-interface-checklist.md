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

- [ ] **PA0-1** (PO) Approve the non-negotiable boundaries in plan §2 as binding — platform admin
      never reads school PostgreSQL directly, never silently installs/activates a plugin inside a
      school, plugin builds never run inside the API/admin-web process
- [ ] **PA0-2** (PO) Approve the persona/permission model in plan §3 — no universal
      `PLATFORM_ADMIN` role; confirm the 9 listed roles and their explicit restrictions are correct
      for how Wattanam staff are actually organized today
- [ ] **PO0-3** (PO/Sec) Decide operator identity provider: marketplace-native accounts to start,
      or OIDC from launch — plan §4 defaults to marketplace-native-first but flags this as an open
      choice
- [ ] **PA0-4** (PO/Sec) Approve the two-person-approval action list (payouts, publisher key
      approval, revenue corrections, and any others identified) — plan §3/§5.7 name several but the
      complete list must be explicit before `AdminApproval` (plan §6) is modeled
- [ ] **PA0-5** (PO) Define school plugin-request types, SLA targets per type, price-override
      authority, and trial policy (plan §5.3) — needed before `SchoolPluginRequest`'s state machine
      is implemented, even though request mutations themselves are PA-3, not PA-1
- [ ] **PA0-6** (PO/Sec) Define the hosted-build network policy, evidence-retention duration, and
      signing-key custody policy (plan §5.5) — needed before `PluginProject`/`PluginBuild` models
      are finalized, even though the build pipeline itself is PA-5
- [ ] **PA0-7** (PL) Write OpenAPI contract stubs for the PA-1 resource groups only
      (`/platform/v1/auth/*`, `/platform/v1/me`) — full API surface (plan §7) grows with each later
      stage, don't front-load all of it now
- [ ] **PA0-8** (Sec) Threat-model operator compromise, approval forgery, and cross-school access
      for the PA-1 slice specifically (login/MFA/session/RBAC) — the fuller threat model (malicious
      packages, build-worker compromise) belongs to PA-5's own gate, not this one

**Exit:** every item above checked with a linked decision record (ADR, product-owner sign-off doc,
or equivalent) before any PA-1 code is merged.

## Stage PA-1 first slice — Secure admin foundation

This is plan §15's "first coding slice," broken into concrete, independently-verifiable steps.
Each should ship as its own reviewed change, matching this repo's established one-package-at-a-time
discipline — do not batch all of PA-1 into one unreviewable diff.

### Data model and bootstrap

- [ ] **PA1-1** (BE) Add `PlatformOperator`, `PlatformRole`, `PlatformPermission`,
      `PlatformOperatorRole`, `PlatformOperatorSession` Prisma models (plan §6) as additive
      migrations against the marketplace database — reuse existing scrypt/Argon2id password hashing
      and audit-event patterns already in `apps/marketplace-api`, don't reinvent them
- [ ] **PA1-2** (BE) Add an `AuditEvent`-shaped model (or extend the existing
      `MarketplaceAuditEvent`) to cover platform-operator actions distinctly from
      customer/publisher actions, matching plan §5.9's required fields (actor, action, target,
      timestamp, correlation id, before/after or decision payload, reason, outcome)
- [ ] **PA1-3** (BE) Offline bootstrap command for the first Platform Owner (a CLI script, not an
      HTTP endpoint — there's no authenticated operator yet to call one) — mirror the existing
      `install-cli.ts` pattern of a standalone, dependency-light bootstrap
- [ ] **PA1-4** (Sec) Seed the initial `PlatformPermission` namespace rows from plan §3's list
      (only the PA-1-relevant ones need to function yet — `platform.dashboard.read`, `operators.*` —
      but model every namespace now so later stages don't need a breaking migration)

### Auth and session safety

- [ ] **PA1-5** (BE) Operator login + mandatory MFA (plan §4) — short-lived server-side sessions in
      `HttpOnly`/`Secure`/`SameSite=Strict` cookies, session digest stored (never the raw token),
      matching the marketplace's own existing session-rotation-with-reuse-detection precedent
      (`identity.service.ts`) rather than a new pattern
- [ ] **PA1-6** (BE) `GET /platform/v1/me` — returns the authenticated operator's identity and
      effective permissions, nothing else
- [ ] **PA1-7** (BE) RBAC middleware: deny-by-default, every route requires an explicit permission
      check server-side (plan §7 — "UI hiding is not authorization")
- [ ] **PA1-8** (BE) CSRF protection and strict origin checks on all mutating routes
- [ ] **PA1-9** (BE) Session inventory + remote revocation + idle/absolute timeout

### Frontend scaffold

- [ ] **PA1-10** (FE) Scaffold `apps/platform-admin` (Next.js, matching the repo's existing shared
      UI conventions) as a genuinely separate deployable app — not a route added to the existing
      school `frontend` or the marketplace customer portal
- [ ] **PA1-11** (FE) `/login`, `/mfa`, protected layout shell, permission-aware navigation (only
      show links the signed-in operator can actually use)
- [ ] **PA1-12** (FE) Correlation-ID propagation from every browser request through to the audit
      log, so a UI action and its audit row are traceable to each other

### Read-only proof surface (smallest useful slice of PA-2, pulled forward to prove the boundary)

- [ ] **PA1-13** (BE/FE) Read-only dashboard: at minimum a system-health card and one real
      aggregate count (e.g. total published plugins) sourced from a purpose-built aggregate
      endpoint, not a browser-side full-table fetch (plan §5.1's stated rule)
- [ ] **PA1-14** (BE/FE) Read-only plugin list and installation list (cursor-paginated, per plan §7)

### Verification

- [ ] **PA1-15** (QA) Negative authorization matrix for every PA-1 route: each defined role against
      each protected action, confirming denial is server-side, not UI-hidden
- [ ] **PA1-16** (QA) Browser smoke test: an operator can log in with MFA, sees only permitted
      navigation, and a direct unauthorized API call fails closed
- [ ] **PA1-17** (SRE) Deploy `apps/platform-admin` + its auth/session/dashboard slice to a
      **non-production** Railway environment (see
      [railway-deployment-guide.md](../operations/railway-deployment-guide.md) for the deployment
      mechanics this repo already uses) and perform one restore drill covering the new operator/
      session/audit tables

**PA-1 exit (from the plan, verbatim):** *"an operator can sign in with MFA, sees only permitted
navigation, and unauthorized API tests fail closed."* Treat PA1-15/16/17 as the literal evidence
for this — not implied by the feature list being complete.

## What comes after (not started by this checklist)

Stages PA-2 through PA-7 (read-only operations expansion, school plugin-request workflow,
publisher/submission review, the official-plugin build pipeline, commerce/finance operations, and
security/support/production hardening) are fully specified in the source plan's §10 but
deliberately **not** broken into checklist items here — each is large enough to deserve its own
checklist once PA-0/PA-1 are actually done, not planned in advance of proof that the foundation
works. Revisit this file to add a "Stage PA-2" section once PA-1's exit criteria are met.
