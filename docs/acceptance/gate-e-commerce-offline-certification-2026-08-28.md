# Gate E Commerce → Entitlement → Offline-Use Certification — 2026-08-28

## Result

The cross-service commerce spine is certified: a purchase settled by the real `CommerceService` produces an entitlement token that the **school's own independently-written verifier** accepts, and the surrounding binding/tamper/clock/renewal/rotation matrix behaves correctly. 23/23 checks pass.

Run with `npm run certify:commerce-offline` from `apps/marketplace-api` (`scripts/commerce-offline-certification.ts`).

This is **partial** E-010 coverage. See [Open items](#open-items) for what it deliberately does not cover.

## Why this drill exists

The marketplace **issues** entitlements (`apps/marketplace-api/src/entitlement.ts`) and the school **verifies** them (`backend/src/marketplace/entitlement-verification.ts`). Those are two separately-written implementations of canonical JSON serialization and claim-window validation, living in two different applications with no shared package between them. Unit tests inside either app pass happily while the two disagree — a canonicalization difference (key ordering, nested normalization) would only surface in production as "every paid plugin fails to activate."

This drill is the only thing in the repo that runs both real implementations against each other.

## What was verified

```text
== E-010: purchase issues a token the school independently accepts ==
PASS settlement marks the order PAID
PASS settlement issued exactly one entitlement
PASS the issued entitlement carries a signed token
PASS the school verifier accepts the marketplace-issued token (cross-service canonical JSON agrees)
PASS verified token is bound to the purchasing installation
PASS verified token is bound to the purchased product
PASS verified token carries the licensed major range

== E-010: offline use (verification is local, no marketplace contact) ==
PASS a cached token verifies with the network disabled entirely
PASS the token still verifies long after its offline-recheck deadline has passed (outage must not disable a paid plugin)

== E-010: token binding and tamper matrix ==
PASS replaying the token against another school installation is rejected
PASS using the token for a different plugin is rejected
PASS extending the expiry inside the payload invalidates the signature
PASS a token signed by an untrusted key is rejected
PASS a token whose key id is not pinned at all is rejected

== E-010: clock and expiry matrix ==
PASS a rolled-back clock before the validity window is rejected
PASS a token past its expiry is rejected

== E-010: renewal issues a fresh, longer-lived token ==
PASS the renewal token is a distinct token, not a reissue of the same id
PASS the renewal token verifies at a date where the original had already expired

== E-010: entitlement-key rotation overlap ==
PASS during a pinned-key overlap the school accepts tokens signed by both the old and the new entitlement key
PASS once the old key is unpinned its tokens stop verifying

== E-010: refund revokes server-side entitlement (documented offline caveat) ==
PASS refunding the order reverses it and marks the entitlement
PASS the refunded entitlement is recorded as REFUNDED server-side
PASS a token already delivered before the refund still verifies offline until it expires

ALL CHECKS PASSED (23/23)
```

The offline check genuinely proves offline-ness: `globalThis.fetch` is replaced with a throwing stub for the duration of the verification, so any accidental network dependency in the verify path would fail the check rather than silently pass.

## Design property this surfaced (not a defect)

**A refund does not retroactively invalidate an entitlement token the school already holds.** Once the marketplace signs a token with a validity window, that token verifies offline until it expires, regardless of a later refund. The refund correctly flips the server-side `InstallationEntitlement` to `REFUNDED`, so the school stops getting a fresh token on its next refresh and loses future downloads/renewals — which is exactly what plan §11.2 specifies ("Refund/revocation stops future downloads and renewals"), and is the direct consequence of §11.2's other rule that verification must be local and must not call the marketplace on every request.

The practical window is bounded by the token's `offlineRecheckAfter`/`expiresAt`, not unbounded. Anyone who needs immediate revocation must use the separate signed security-advisory path (D-006), not a refund. This is called out here so it is a recorded design decision rather than a surprise during E3 finance reconciliation.

## Open items

This drill does **not** close E-010 on its own:

- **No live database.** Docker, a local PostgreSQL, and any remote connection string were all unavailable this session, so `CommerceService`/`reverseOrder` ran against in-memory transaction stubs shaped like the real Prisma rows, not real rows under real constraints. The refund/dispute/revocation half of the ledger *has* been live-verified separately ([gate-e-refund-dispute-revocation-postgres-2026-08-28.md](./gate-e-refund-dispute-revocation-postgres-2026-08-28.md)); the purchase→token→offline spine has not.
- **Not in CI.** `apps/marketplace-api`'s `tsconfig.json` sets `rootDir: src`, so a spec importing the school's verifier from outside `src/` would break `npm run build`. The drill is therefore a script (matching the repo's existing `backend/scripts/*` drill convention) and only runs when invoked. Wiring it into CI needs either a shared package for the entitlement contract or a separate tsconfig for cross-service tests — deliberately not done here to avoid touching the build config for the Docker image.
- **Outage matrix is covered elsewhere and only at unit level.** The fail-open-on-outage / fail-closed-on-tamper cache behavior lives in `backend/src/marketplace/entitlement-cache.service.spec.ts` (9 tests) and is not re-exercised here.
- **The full E-010 acceptance ("purchase → token → offline use → renewal/refund/outage matrix") also requires the E-006/E-011 purchase UI journeys**, which do not exist yet.
