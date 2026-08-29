# Custom-Domain State Machine

Implements B-007's exact acceptance bar: "Pending/verified/active/error states; exact DNS
instructions; TLS and CORS verification," and the residual risk the master plan names for it
("Domain misconfiguration breaks login: TLS/CORS/cookie/socket mismatch" — mitigated here by
never removing the canonical Railway-generated origin from `CORS_ORIGINS` until a working
custom domain is proven, and by a one-command rollback).

## States

```
pending --(DNS record confirmed)--> verified --(TLS+content probe passes)--> active
   ^                                    |                                       |
   |------------(probe fails)-----------+                                       |
   |                                                                            |
   +-------------------------- rollback (operator-triggered) <------------------+
```

- **pending**: a custom domain was requested from Railway; the operator has been given the
  exact DNS record to add and is waiting for it to propagate.
- **verified**: the DNS record now resolves correctly. TLS/CORS have not been touched yet.
- **active**: the end-to-end TLS+content probe against `https://<domain>` succeeded, and
  `CORS_ORIGINS` on the API service now includes the custom domain **alongside** the original
  canonical origin (never replacing it) — the residual-risk mitigation named above.
- **error**: DNS resolved to something other than what was requested (not just "not yet
  propagated," which stays `pending`), or the TLS/content probe failed after DNS looked correct.
- **rolled_back**: an operator explicitly reverted `CORS_ORIGINS` back to only the canonical
  origin.

## Usage

```bash
# 1. Request the domain (dry-run by default; add --execute --confirm-domain <domain> to run for real)
node tools/manage-custom-domain.js request \
  --domain school.example.org --project <railway-project-id> --school-slug angkor-school \
  --canonical-origin https://angkor-school.up.railway.app

# 2. Give the operator the DNS instructions printed above. Re-run until it flips to "verified"
# (read-only DNS check; safe to run repeatedly, no --execute needed):
node tools/manage-custom-domain.js verify --journal custom-domain-angkor-school.journal.json

# 3. Once verified, run the TLS/content probe. Add --execute to also update CORS_ORIGINS for real:
node tools/manage-custom-domain.js activate --journal custom-domain-angkor-school.journal.json --execute

# If anything looks wrong after activation, revert CORS to the canonical origin only:
node tools/manage-custom-domain.js rollback --journal custom-domain-angkor-school.journal.json --execute
```

Every mutating step (`request --execute`, `activate --execute`, `rollback --execute`) requires
`--execute` explicitly — omitting it always prints the exact `railway` command that *would* run
without touching anything, matching `tools/provision-railway-school.js`'s established
convention. `request --execute` additionally requires `--confirm-domain <domain>` matching
exactly, the same double-check gate `provision-railway-school.js` uses for `--confirm-slug`.

## Verification

- `tools/custom-domain-dns.js` (the DNS/TLS probe primitives) and `tools/manage-custom-domain.js`
  (the state-machine orchestrator) have 18 passing tests (`npm run test:tools`), plus 3 more
  (`npm run test:tools:live`) that hit real public DNS/HTTPS rather than mocks:
  - `checkCnameRecord` was proven against a real, well-known public CNAME
    (`www.github.com` → `github.com`) and reused inside `manage-custom-domain.test.js` to prove
    the full `verify` CLI action transitions `pending` → `verified` end to end over the real
    internet, not a mock.
  - `probeCustomDomain` was proven against a real HTTPS endpoint (confirms real TLS + real
    content matching) and against a nonexistent domain (confirms it fails closed, `tlsOk:
    false`, rather than silently reporting success).
  - The `activate` action was proven to transition to `error` (and to never call the Railway
    CLI at all) when the probe fails, using a real nonexistent domain — no mocking needed, since
    the failure happens before any Railway call would be made.
- Every `railway` command this tool constructs (`domain ... --service --project --environment
  --json`, `variable set KEY=value --service --project --environment --skip-deploys --json`) was
  cross-checked against the real, locally-installed Railway CLI's own `--help` output (the same
  technique used to verify `provision-railway-school.js`'s commands) — every flag matches.

## What this does not close

- **No real Railway project or domain was used to test this.** The `request`/`activate
  --execute`/`rollback --execute` code paths that actually call the Railway CLI have never run
  against a real project — everything above proves the DNS/TLS/state-machine logic and the
  command *syntax*, not a live Railway integration.
- **Railway's exact JSON response shape for a custom domain's required DNS record is
  unverified.** `parseDnsInstructions()` in `tools/manage-custom-domain.js` checks several
  plausible field names (`cname`, `cnameTarget`, `target`, `dnsRecords[0].value`,
  `records[0].value`) and fails with a clear error — including the raw response — if none
  match, rather than silently assuming a shape that might be wrong. The first real run against
  an actual Railway project should confirm (or correct) this.
- No automated retry/scheduling exists for the `verify` step — an operator (or a future cron
  job) must re-run it manually until DNS propagates.
- TXT-record verification (`checkTxtRecord`) is implemented and tested but not currently wired
  into the state machine, which only uses CNAME verification — kept as a documented option
  since some domain-ownership-verification flows prefer TXT records over CNAMEs.
