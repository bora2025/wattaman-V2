# WordPress-style paid-plugin entitlement enforcement evidence

Date: 2026-09-26  
Scope: ADR-0016 per-plugin entitlement state (not whole-school control signing)

## Implemented

- Paid Marketplace download refreshes and verifies the installation-bound Ed25519 entitlement
  before artifact download.
- Core centrally gates activation and updates. An expired, revoked or refunded paid plugin cannot
  activate or update.
- Plugin dispatch remains readable for `GET`, `HEAD` and `OPTIONS`, rejects mutations with HTTP 402,
  and records the denial in the audit log. Background jobs stop while the plugin is read-only.
- The school preserves last-known-good state through Marketplace outages. An elapsed online refresh
  deadline is reported as grace until the signed licence expiry.
- Signed decisions include their terminal status and a monotonically increasing generation. Both
  online refresh and offline import reject an older generation or a conflicting token at the same
  generation. An unsigned transport status cannot override the signed status.
- Verification accepts the documented five-minute clock tolerance.
- Existing schema-v1 production tokens are upgraded on their first authenticated fetch. Refund,
  dispute, operator revocation and scheduled expiry issue a new signed terminal decision rather than
  returning an unsigned database status beside an older ACTIVE token.
- Database migrations add generation state to the Marketplace source of truth and school cache.
- Whole-school billing control is now an installation-bound Ed25519-signed document with its own
  monotonically increasing generation. The school verifies signature, audience, installation,
  timestamp and shape, then rejects equal/older generations before writing its last-known-good
  control state.

## Verification

- Backend focused suite: 82 tests passed across entitlement verification/cache/policy, route and job
  enforcement, activation, update and Marketplace install.
- Direct enforcement suite: 49 tests passed for route reads/writes, stopped jobs, activation and
  update preflight.
- Marketplace focused suites: 106 tests passed for issuance, refund/revocation/expiry, authenticated
  payment webhooks, legacy access/upgrade and billing behavior. An additional 21 backend tests pass
  for signed school-control verification, synchronization and outage behavior.
- TypeScript no-emit checks pass for both `backend` and `apps/marketplace-api` after Prisma generation.

## Remaining acceptance gap

Hosted expiry, revocation, clock-skew, replay, Marketplace-outage and seven-day whole-school outage
drills are required before production acceptance. The broader Phase 1 item therefore remains
**in progress** even though its local implementation and focused tests are complete.
