# Gate E — Identity, Installation Registration, and Entitlement Cache Live Drill — 2026-08-29

## What this closes

E-001 (customer identity), E-002 (installation registration challenge/rotation), and E-005
(school entitlement cache) had all previously been verified only against mocked Prisma
transactions and in-process function calls. This drill is the first to run them against two
real PostgreSQL 16 databases with the marketplace's real Express app listening on a real HTTP
port and the school's real `InstallationRegistrationService`/`InstallationKeyService`/
`EntitlementCacheService` classes making real signed HTTP calls to it — the same shape of
cross-service, cross-database interaction these three work packages will actually run under in
production.

New script: `apps/marketplace-api/scripts/identity-registration-entitlement-live-drill.js`, wired
into `.github/workflows/phase-e-commerce-certification.yml` (a second `school` database is
provisioned alongside the existing `marketplace` one, and the drill runs after both services'
migrations and builds).

## A real bug this drill found and fixed

`login()`, `refreshSession()`, and `disableMfa()` in `apps/marketplace-api/src/identity.service.ts`
recorded failure-path state — lockout counters, "revoke every session on reuse detection", and the
audit row for each of those events — *inside* the same Prisma interactive transaction that then
threw an `HttpError` to signal the failure back to the caller. A Prisma interactive transaction
rolls back every write its callback made if that callback throws. The practical effect, live and
confirmed against real PostgreSQL:

- Exponential account lockout never actually engaged: `failedLoginCount`/`lockedUntil` were computed
  and written, then silently discarded on every single failed attempt.
- Presenting an already-rotated session token was correctly rejected for *that* request, but the
  "revoke every other session on this account" side effect it's supposed to trigger never
  persisted — a still-valid session token kept working right through what should have been a
  full account-wide revocation.
- None of `login_failed`, `login_locked`, `session_reuse_detected`, or `mfa_challenge_failed` audit
  rows were ever actually written, despite the code appearing to write them.

The existing mocked-transaction unit tests (`identity.service.spec.ts`) could not have caught this:
they stub `$transaction` as `(work) => work(tx)`, which calls the callback directly and has no
rollback semantics at all — from a mock's point of view, `tx.marketplaceAccount.update(...)` was
called with the right arguments, and that's where the mocked test's visibility ends. This is
exactly the class of bug live-database verification exists to catch.

**Fix**: `login()`, `refreshSession()`, and `disableMfa()` now have their transaction callbacks
return a `{ ok, ... }` result instead of throwing, and the caller throws the `HttpError` *after*
`$transaction` has resolved and committed. The three failure-path writes now survive. All 118
`apps/marketplace-api` tests (including the pre-existing mocked `identity.service.spec.ts` cases)
and all 45 `backend/src/marketplace` tests still pass unchanged after the fix — the refactor is
behavior-preserving from the outside, only the persistence is now correct.

## Verification

66/66 checks pass, run twice from a fresh pair of databases to confirm the result is stable, not
incidental:

**E-001** (22 checks): register, duplicate-registration rejection, bogus/real/reused email
verification tokens, login before and after MFA is enabled, TOTP enrollment (wrong code rejected,
real code accepted via the real base32/HMAC-SHA1 implementation), 8 recovery codes issued, `mfa_required`
gating, wrong-TOTP rejection, login via TOTP, login via a recovery code and rejection of reusing
it, session refresh, replaying an already-rotated token, **the account-wide reuse-detection
revocation now actually taking effect on a separate still-valid session** (this is the specific
behavior the bug above broke), explicit session revocation. A second block (12 checks) proves
**exponential lockout now actually locks** the account after 5 failures even against the correct
password, and that a password reset both succeeds and lifts the lockout. A final check confirms
every one of `account_registered`, `email_verified`, `mfa_enrolled`, `mfa_enabled`,
`login_succeeded`, `login_failed`, `login_locked`, `session_refreshed`, `session_reuse_detected`,
`session_revoked`, `password_reset_requested`, and `password_reset_completed` has a real row in
`MarketplaceAuditEvent`.

**E-002** (11 checks): the school's real `InstallationRegistrationService` generates and persists
an Ed25519 keypair locally, requests a real challenge, signs it, and registers over live HTTP;
re-registering an already-registered installation is rejected both through the school's client and
via a direct challenge request; key rotation revokes the old key and activates the new one
server-side; **replaying rotation using the pre-rotation key against a freshly requested challenge
is rejected** (proof that continuity-of-control is enforced against the *current* key, not just
checked once at registration); the rotated private key survives being reloaded from disk by a
brand-new `InstallationKeyService` instance, simulating a process restart.

**E-005** (12 checks): a plugin with no purchase resolves to `NONE`; a real purchase
(`CommerceService.createOrder` + `settleManualPayment` against the live marketplace database, using
the installation registered in the E-002 phase) issues a real Ed25519-signed entitlement; the
school fetches, verifies, and caches it over live HTTP; closing the marketplace's HTTP server and
refreshing again leaves the cached entitlement byte-for-byte untouched (fail-open) while still
recording the failure for backoff; tampering the stored token's signature causes the next refresh
to leave the cache untouched (fail-closed on trust, not on data access) and write a real
`entitlement_verification_failed` row to the school's own `AuditLog`; restoring the good token lets
the next refresh recover cleanly; offline export/import round-trips and rejects a tampered export.

To exercise the 1/5/15/60-minute backoff schedule without either forging the timestamp inside the
signed HTTP request (which would fail the marketplace's real ±5-minute freshness check) or
sleeping for up to an hour in CI, the drill backdates only the cache row's own
`lastRefreshAttemptAt` bookkeeping column between phases — the signed request itself always carries
the real wall clock, exactly as production does.

## Remaining gate evidence

This closes the "live-PostgreSQL verification" gap explicitly named against E-001/E-002/E-005 in
the completion checklist. Still outside engineering: a transactional email provider to actually
deliver verification/reset tokens (DEC-006/009/013), the formal privacy review (A-006), and FL
policy sign-off on refund/dispute rules (unrelated to this drill, already tracked against E-009).
