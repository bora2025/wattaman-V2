# Platform Admin Browser End-to-End Harness — 2026-09-02

## Scope

First browser-level test harness for the operator control plane. It covers the PA2-6 authorization
matrix, browser journeys, and accessibility gate, PA2-3's real CSV download, and PA3-8's live
PostgreSQL migration plus request→approval→entitlement browser journey including the two-person
exceptional grant.

It does **not** close the hosted (Railway) non-production evidence PA2-6 and PA3-8 also require,
nor PA3-8's concurrency and retry drills. Those remain open; see "Remaining" below.

## Harness

`apps/platform-admin/scripts/e2e-stack.mjs` (`npm run e2e`) provisions a throwaway stack and tears
it down again:

1. PostgreSQL 16 in Docker on port 15440, fresh database;
2. `prisma migrate deploy` — the real migration path, from an empty schema;
3. marketplace API built from source and started under `NODE_ENV=production` with a real identity
   encryption keyring, so seeded operator MFA secrets are stored the way production stores them;
4. `scripts/bootstrap-platform-owner.ts` creates the first owner, deliberately left un-enrolled;
5. `apps/marketplace-api/scripts/seed-platform-e2e.ts` adds seven further operators spanning six
   roles (plus one with no roles) and the marketplace records the screens render;
6. the operator app built and served from its Next.js standalone production output;
7. Playwright (Chromium) against that stack, then teardown.

Nothing is mocked. The properties these tests exist to prove — mandatory MFA gating, deny-by-default
authorization, the session token never reaching page JavaScript, audit rows actually being written,
dual control on exceptional grants — are exactly the ones a mocked backend would hide.

`npm run e2e:keep` leaves the stack up for interactive work and prints the command to drive it.

## Result

**48 Playwright tests, all passed** (48.4s), against a database created from migrations in the same
run. Coverage by file:

| Spec | Tests | What it establishes |
| --- | --- | --- |
| `01-authentication` | 5 | A first sign-in cannot reach anything until MFA enrollment completes (the enrollment-only session is refused `403` on `/dashboard`, then allowed `200` on the same session once confirmed); a wrong TOTP leaves no session; the session cookie is `HttpOnly`/`SameSite=Strict` and its value appears nowhere in `document.cookie` or the page; sign-out invalidates it; the proxy refuses unlisted routes and cross-origin mutations |
| `02-authorization` | 15 | Navigation for each of six identities equals its permitted set exactly — including a Platform Owner who cannot browse the catalog, customers, or commerce, and an operator with no roles who sees no navigation at all. Each denial is asserted twice: the screen refuses, *and* the API returns `403` for the same operator's own browser session |
| `03-read-surface` | 13 | Every PA-2 queue renders seeded records, filters narrow them and survive a reload via the URL, detail pages open, customer addresses are masked everywhere they appear, and reading the audit log writes its own `platform_audit_read` row attributed to the reader |
| `04-exports` | 4 | Real browser downloads of `orders.csv`, `entitlements.csv`, `installations.csv`, `audit-events.csv`; masked addresses in the file; a seeded school label of `=SUM(1+1)` comes back as `"'=SUM(1+1)"`, inert in a spreadsheet; the download writes a `platform_export` audit row naming the operator |
| `05-plugin-requests` | 5 | A free-plugin request driven queue→assign→review→approve→entitlement with a complete attributable timeline; free access to a *paid* plugin refused to a single operator, the second-approval control absent for the proposer, the API answering `409` to their direct attempt, then a second operator approving and the 180-day exceptional entitlement issuing |
| `06-accessibility` | 6 | axe-core finds zero WCAG 2.1 A/AA violations on the sign-in, MFA, and enrollment screens, all twelve operator screens, and three detail screens; the shell is reachable and followable by keyboard alone |

## Defects found and fixed

**1. `prisma migrate deploy` could not build a marketplace database from scratch.** The PA-3
migrations `20260831170000_school_plugin_requests` and `20260902010000_plugin_request_fulfillment`
declared `UUID` columns for foreign keys referencing `TEXT` primary keys, so PostgreSQL rejected
`SchoolPluginRequest_accountId_fkey` with *"Key columns \"accountId\" and \"id\" are of incompatible
types: uuid and text"*. Every other table in the schema uses `TEXT`, and the later
exception-approval migration got it right, so the two files can never have applied anywhere — a new
marketplace deployment would have failed at provisioning. Seven column types corrected to `TEXT`.

**2. Serious colour-contrast failures on every operator screen.** `text-slate-400` (#94a3b8, ≈2.6:1
on white) carried real information — an unlinked school, a system-generated audit actor, an empty
detail field, the signed-in operator's roles — below the 4.5:1 WCAG AA threshold. Raised to
`text-slate-500` (≈4.76:1) in `OperatorShell`, `RecordInspector`, and the audit, installations, and
operations screens. This was the only violation class axe reported, and it appeared on all fifteen
screens scanned.

## Verification notes

- The suite's TOTP generator is written from RFC 6238 rather than imported from the API's
  `identity-crypto.ts`: the test stands in for the operator's authenticator app, so an independent
  implementation means a passing sign-in shows both sides agree with the standard, not merely with
  each other.
- API assertions run `fetch` inside the page rather than through Playwright's `page.request`. The
  latter issues calls from outside the document, so the `SameSite=Strict` session cookie does not
  ride along and every authorization check returns `401` instead of the `403` under test.
- `05-plugin-requests` drives a one-way lifecycle and therefore requires freshly seeded fixtures;
  re-running it against a database it has already touched fails by design.
- One harness defect cost two red runs and is worth recording: running Playwright through
  `spawnSync` blocked the script's event loop, so nothing drained the API's stdout pipe. After
  ~64KB of request logs the API blocked on its next write and the remaining tests failed with
  *"Marketplace API is unavailable"* — indistinguishable from an application crash. The Playwright
  invocation is now asynchronous.

## Remaining

- **PA2-6 / PA3-8 hosted evidence**: this harness runs on local disposable PostgreSQL. The isolated
  Railway non-production run both stages require is still outstanding.
- **PA3-8 concurrency and retry drills**: not covered here.
- **PA-3 school-side install**: the browser journey ends at entitlement issue; the school's own
  local install/activate step is exercised by the marketplace-link drills, not by this suite.
