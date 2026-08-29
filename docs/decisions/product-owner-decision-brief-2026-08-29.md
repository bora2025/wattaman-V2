# Product Owner Decision Brief — DEC-001 through DEC-013

## Why this document exists

Every release gate in `docs/completion-checklist.md` (A0, B0, C0, D0, E0/E1, F0) is blocked on
these 13 decisions — not because the engineering underneath them is missing, but because
nobody with the authority to accept a business/product decision has done so yet. This document
exists to make that approval fast rather than hard: for each decision, it states what the
plan proposes, what the codebase **actually already does today** (verified by reading the real
code, not the plan text), and what changes if you decide differently than proposed.

**The headline finding: 11 of these 13 decisions are already the codebase's only implemented
behavior**, and accepting them as proposed costs nothing — it formalizes what has already
shipped. Two are real exceptions, in opposite directions: **DEC-004** (base product scope) has
been *outgrown* — the backend ships roughly 3x the module scope the proposal names, so accepting
it literally would imply a large, unstarted descoping project, not a rubber stamp. **DEC-012**
(telemetry) is a genuine blank slate — nothing has been built either way, deliberately, until
you decide. (DEC-009 also has a small, worth-noting naming divergence, flagged in its row.)

## How to use this

For each row: **Accept as proposed** requires no action from engineering — it's already true.
**Anything else** should be raised as a follow-up conversation before assuming it's a small
change; several of these are structural (e.g., DEC-003's single-installation model is not a
config flag, it's the shape of the `Installation` table itself).

| # | Decision | Plan proposes | What's actually built today | If you decide differently |
|---|---|---|---|---|
| DEC-001 | Core license | Proprietary distribution; school keeps unconditional contractual data-export rights | **Already drafted verbatim.** [terms-of-service-v1.0.md](../policies/terms-of-service-v1.0.md) and [ADR-0006](../architecture/adr/0006-licensing.md) state exactly this, cross-referenced with the privacy policy's export rule | Rewriting the customer-facing legal terms and the entitlement contract they describe |
| DEC-002 | Commercial model | Annual subscription for updates/support; installed core stays usable after expiry | **Already built as a hard invariant**, not just policy text: `entitlement-cache.service.ts`'s own design principle is "an outage or expiry must never disable functionality a school already has" — enforced in code, not just promised in a document | Would require actively building an enforcement mechanism to *disable* functionality on expiry — currently structurally impossible without new engineering |
| DEC-003 | Tenancy | One school org per installation; campuses are children, not tenants | **Already the only architecture that exists.** `Installation` is a Prisma singleton (`id @default("singleton")`) — there is no multi-tenant code path anywhere to turn off | Multi-tenant campuses would mean redesigning the `Installation` model and everything that assumes a single school per deployment — a major structural change, not a toggle |
| DEC-004 | Base product scope | Identity/roles/students/staff/academic structure/attendance/audit/installation/backup/plugin host — ~10 concepts | **Not yet true — this is the one place the codebase has outgrown the proposal, not matched it.** The backend ships 35 modules today, only about a third of which map to DEC-004's named list; fees, salary, bus, exam, scoring, timetable, card templates/aliases, posts, class registrations, parent, staff CV, holidays, departments, study years, session config, and site settings are all still core, not plugins. Announcements is the *only* precedent for moving something out to a plugin (C-004) | Accepting DEC-004 **as the final word on scope** would mean doing an Announcements-style extraction for every one of those modules — real, substantial, currently-unstarted engineering, not a scope-doc edit. More likely you want to accept DEC-004 as the *original intent* while formally widening the base-product decision to match what's actually shipped, rather than triggering a large descoping project |
| DEC-005 | Launch region | Cambodia first; Khmer/English; USD/KHR; `Asia/Phnom_Penh` default | **Already built end to end**, confirmed by direct audit: a full Khmer UI dictionary and font loading, Cambodia-timezone date formatting including Khmer-numeral dates, and the unattended installer's own defaults (`en-KH`, `Asia/Phnom_Penh`, `KHR`) all assume exactly this ([evidence](../acceptance/gate-accessibility-localization-audit-2026-08-29.md)) | A different or additional launch region needs real i18n/timezone/currency work per region — the current implementation is genuinely Cambodia-specific in places (hardcoded `Asia/Phnom_Penh` in date-formatting utilities), not parameterized yet |
| DEC-006 | Connectivity | Offline-first; offline install/import; offline entitlement tokens | **Already built and live-verified repeatedly**: signed offline entitlement tokens (E-004), offline import/export (E-005/E-006), and — found during the accessibility audit, not originally attributed to this decision — a real IndexedDB offline-attendance queue and service worker in the frontend | Would mean relaxing invariants that are currently load-bearing across commerce, entitlements, and the frontend's offline queue |
| DEC-007 | Publishing | Wattanam-only through Milestone E; invited verified publishers in F pilot; no open upload | **Already built exactly this way.** Publisher submission requires org verification and dual-controlled key enrollment (F-002); there is no self-service open-upload path anywhere — confirmed explicitly in C-008's own evidence ("not opening third-party self-service submission... that's F-003, gated by DEC-007") | Opening self-service publishing would need new abuse/review-capacity engineering the current F-002–006 controls don't provide |
| DEC-008 | Hosting | Railway (one project per school) and Docker Compose both supported | **Already both real.** `docker-compose.yml`, per-app `Dockerfile`s, and a live Railway reference deployment (D-001) both exist and are exercised | Supporting a third hosting target (e.g. Kubernetes) is genuinely new packaging work |
| DEC-009 | Payments | Manual/offline invoice first, **Stripe-compatible** card adapter second | **Manual invoice: built exactly as proposed (E-007).** Card/online adapter: built, but as a **provider-agnostic HMAC-signed webhook scheme** (`provider: 'online-hmac-v1'` in `payment-webhook.service.ts`), not Stripe-specific. This is a real, worth-noticing divergence from the literal proposal — arguably a better outcome (no vendor lock-in), but it means "Stripe" isn't actually wired in; a generic adapter contract is | If you specifically need Stripe (rather than "a" card processor), that's an adapter-implementation task against the existing generic contract, not a from-scratch build |
| DEC-010 | Storage | Railway/local volumes first; S3-compatible adapter after a file inventory | **Both already built**, and further along than "after an inventory" implies: checksum-aware local, S3-compatible, and dual-write providers all exist with a live-tested bidirectional migration path (B-015) | N/A — this is fully built either way you'd plausibly decide |
| DEC-011 | Plugin trust | Reviewed, signed, in-process plugins; capabilities are contracts, not a sandbox | **Already the entire Phase C architecture**, and explicitly, deliberately documented as such: [security-review-checklist.md](../plugins/security-review-checklist.md) states plainly that "a plugin is trusted in-process code with no sandbox" | A sandboxed plugin model (e.g. separate processes/workers with a narrower capability surface) would be a from-scratch redesign of the entire plugin runtime, not an incremental change |
| DEC-012 | Telemetry | Opt-in only; never student/grade/attendance/fee/message/location payloads | **The one real exception. Nothing is built either way.** [ADR-0008](../architecture/adr/0008-telemetry.md) confirms zero telemetry code exists anywhere in `backend/src` today — this decision is genuinely pending engineering, not just pending approval | Accepting it means real new work (the opt-in beacon, the payload allowlist enforcement); rejecting it means telemetry stays undone, which is also the status quo |
| DEC-013 | Entitlement format | Ed25519-signed canonical JSON, installation-bound, 30-day offline grace | **Already built with the exact number**: `commerce.service.ts` computes `offlineRecheckAfter` as `Math.min(30, licenseDays)` days — the "30" in the proposal is the literal constant in the code, not a rounded approximation | Changing the grace period, signature scheme, or binding model touches the entitlement issuance and verification code on both sides (`apps/marketplace-api` and `backend/src/marketplace`), which is cross-service, tested, live-verified code today |

## The practical ask

- **DEC-001, 002, 003, 005, 006, 007, 008, 010, 011, 013 (10 of 13)**: accepting these as
  proposed is a same-day action — approve, and every gate that's been waiting on "is this
  decision accepted" moves to formally closed with no engineering follow-up required, because
  the engineering is already done and already matches the proposal.
- **DEC-009**: accept the staged rollout as proposed, but note in the acceptance record that
  the actual adapter is provider-agnostic HMAC, not Stripe-branded, so nobody later assumes
  Stripe integration exists when it doesn't.
- **DEC-004 needs an actual conversation, not a rubber stamp.** Either accept the original
  narrow scope and schedule the (substantial) work to extract fees/salary/bus/exam/scoring/
  timetable/etc. into plugins to match it, or formally widen the base-product decision to the
  scope that's already shipped. Approving the literal text without addressing this leaves a
  real mismatch between what's decided and what's deployed.
- **DEC-012**: this is the one decision that actually gates *future* work rather than ratifying
  past work. Accept/reject/defer it on its own merits — there's no hidden already-built reality
  to weigh here.
