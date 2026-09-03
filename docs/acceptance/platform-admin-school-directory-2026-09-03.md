# Platform Admin School Directory and Enrollment Claim — 2026-09-03

## Scope

Increment 1 of the school-control plan: the operator control plane gains a customer school
directory, and a school deployment can claim its place in that directory with a one-time
enrollment token minted by a named operator.

This is deliberately *not* infrastructure provisioning. `tools/provision-railway-school.js` remains
unexecuted and incomplete (B-005/B-006/B-007 are all `[~]`), and no Railway credential goes near
the control plane. It is also not lifecycle control: suspend, reinstate, and terminate are
increment 2, and nothing here changes what a school's own system does.

## Problem it addresses

Before this change the console's entire model of a school was `InstallationRegistration
{ installationId, accountId?, label?, lastSeenAt, keys[] }` — no name, no contact, no plan, no
status. Operators looked at bare UUIDs. The permission `schools.manage` ("Correct or unlink school
installation records") had been seeded since PA-1 and was enforced by zero endpoints.

Registration also bound an installation to any `accountId` that merely *existed*
(`installation-registration.service.ts:64-65`), with no approval from that account and no record of
who authorised it.

## Controls implemented

- additive `CustomerSchool` and `SchoolEnrollmentToken` models, a `SchoolLifecycleStatus` enum, one
  nullable unique `InstallationRegistration.customerSchoolId`, and a migration that applies cleanly
  from an empty database;
- `/platform/v1/schools` list/detail behind `schools.read`; create, update, mint, revoke, and
  adopt behind `schools.manage` — the first endpoints ever to enforce that permission;
- only the SHA-256 of an enrollment token is stored, and the plaintext is returned exactly once;
- one live token per school, so a double-submit conflicts rather than leaving two valid secrets in
  circulation, and a retry cannot silently mint a second;
- the token is redeemed *after* the registration signature verifies, so a forged attempt cannot
  burn a customer's token;
- every rejection of a token — unknown, consumed, revoked, expired, or belonging to a suspended
  school — returns one identical message, so the endpoint is not an oracle for probing tokens;
- registration without a token behaves exactly as before, so every existing school keeps working;
- `adopt-installation` binds a deployment that registered before the directory existed, without
  rotating its identity key for a bookkeeping reason;
- an installation cannot belong to two schools, and a terminated school cannot be edited, enrolled,
  or adopted into;
- every mutation writes a `PlatformAuditEvent` inside the same serializable transaction, carrying
  the operator, an internal reason, and the request's correlation id; updates record the before and
  after of exactly the fields that moved.

## Verification

- Prisma schema validation: passed.
- Migration applied from an empty database through the full history: passed.
- Marketplace API TypeScript build and school backend build: passed.
- Marketplace API tests: **28 suites, 211 tests, all passed** (13 new for the directory service,
  8 new for token redemption at registration).
- School backend tests: **48 suites, 261 tests, all passed** (1 new for the token pass-through).
- Contract tests updated: the OpenAPI document now declares 37 permission-protected routes, and the
  deny-by-default authorization matrix covers all six new route/permission pairs across all 9
  seeded roles.

### Live drill

`apps/marketplace-api/scripts/school-directory-live-drill.js`, run against two real PostgreSQL 16
databases with the real migrations, the real Express app on a real HTTP port, and the school's real
`InstallationKeyService` / `InstallationRegistrationService` making real signed calls:

**24/24 checks passed.** Notably:

- an operator with no second factor reaches nothing (`403` on the directory), enrols through the
  real mandatory-MFA path, and only then holds a session that can act;
- a school created in `PROSPECT` moves to `AWAITING_CLAIM` on mint and `ACTIVE` on claim;
- a real school backend redeemed the token and was told which customer it is; the console then
  showed "Angkor High School" where it would previously have shown a UUID;
- replaying the consumed token onto a second installation was refused, and left no registration
  behind;
- a school with no token registered exactly as before, and was afterwards adopted into a second
  directory record;
- an auditor could read the directory and was refused creation with
  `Missing required permission: schools.manage`;
- the three rejected mutations wrote no audit rows, so the five successful ones are the whole
  record.

## Known limitations

- An enrollment token proves an operator authorised *this school*. It does not make the
  caller-supplied `accountId` trustworthy — that remains an unverified claim, and closing it needs
  the account-consent work that the marketplace-link flow already models.
- `InstallationRegistration.lastSeenAt` is still written only on key rotation, so the directory's
  liveness column and the "installations not seen in 30 days" health metric remain misleading.
  Increment 2 fixes this.
- No console UI yet; the directory is reachable through the API only. That is increment 4, and the
  Next.js proxy allow-list is deliberately not yet extended, so the browser cannot reach these
  routes.
