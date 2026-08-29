# B-007 — Custom-Domain State Machine — 2026-08-29

## What this implements

Plan acceptance bar: "Pending/verified/active/error states; exact DNS instructions; TLS and
CORS verification." New `tools/manage-custom-domain.js` (orchestrator, following
`tools/provision-railway-school.js`'s exact conventions — dry-run unless `--execute`, a
`--confirm-domain` double-check gate, a journal file) and `tools/custom-domain-dns.js` (the
DNS/TLS probe primitives, deliberately factored out so they're testable against real public
DNS/HTTPS without needing a Railway project). See
[custom-domain-state-machine.md](../deployment/custom-domain-state-machine.md) for the full
state diagram and usage.

States: `pending` → `verified` → `active`, plus `error` and `rolled_back`. The residual risk the
plan names for this item ("Domain misconfiguration breaks login... retain prior domain
redirect; rollback canonical origin") is addressed directly: `activate` only ever *adds* the
custom domain to `CORS_ORIGINS` alongside the existing canonical Railway origin, never replaces
it, and `rollback` reverts to the canonical origin alone in one command.

## Verification

- 21 tests total, all passing: `npm run test:tools` (18, mostly mocked plus a few real-DNS
  ones) and `npm run test:tools:live` (3, exclusively real public DNS/HTTPS, kept in a
  separate file so `node:test`'s per-test mock scoping never risks leaking into them).
- **Real, not mocked, coverage of the actual mechanism**: `checkCnameRecord` was proven against
  a real, well-known CNAME (`www.github.com` → `github.com`), and that same pair was reused to
  drive the full `verify` CLI action end to end over the real internet (`pending` → `verified`),
  not simulated. `probeCustomDomain` was proven against a real HTTPS endpoint (real TLS
  handshake, real content match) and against a nonexistent domain (fails closed — `tlsOk:
  false` — rather than silently reporting success). The `activate` action's failure path was
  proven to transition to `error` and to never invoke the Railway CLI at all when the probe
  fails.
- Every `railway` command this tool constructs was cross-checked against the real,
  locally-installed Railway CLI's own `--help` output (same technique used for B-005/B-006's
  `provision-railway-school.js`) — `domain`/`variable set` flags all match.
- One real test-design bug found and fixed along the way, itself informative: an
  intended "DNS record not yet propagated" test case, querying a genuinely nonexistent
  subdomain, took 25+ seconds and returned `ETIMEOUT` rather than the expected fast `NXDOMAIN`
  in this sandboxed environment — resolver behavior for nonexistent names is not uniformly fast
  or uniformly an `ENOTFOUND`/`ENODATA` error everywhere. Rather than accept a flaky, slow test
  (or weaken the production code to treat timeouts as "still pending," which would be the wrong
  fix — a real timeout during a real domain-verification poll is a genuine problem worth
  surfacing as `error`, not silently retrying forever), the state-transition decision
  (`decideVerifyState`) was extracted into its own pure, exported function and tested directly
  and deterministically; the real live DNS coverage for the success path was kept as-is.

## What this does not close

- **No real Railway project or domain was used.** Every code path that actually calls the
  Railway CLI (`request --execute`, `activate --execute`, `rollback --execute`) has never run
  against a real project. What's verified is the DNS/TLS/state-machine logic and the exact
  command syntax, not a live end-to-end Railway integration — stated plainly, not implied as
  more than it is.
- **Railway's exact JSON shape for a custom domain's DNS instructions is unverified** —
  `parseDnsInstructions()` checks several plausible field names and fails loudly with the raw
  response if none match, rather than guessing silently. The first real run against an actual
  Railway project should confirm or correct this.
- No automated scheduling exists for re-running `verify` while DNS propagates — that's a manual
  or future-cron-job step.
