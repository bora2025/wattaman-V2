# WordPress-style starter bundles — implementation evidence

Date: 2026-09-28  
Status: **local two-database PostgreSQL certification passed; hosted browser proof pending**

## Boundary

A starter bundle is curated Marketplace metadata, not a package, deployment image, entitlement or
discount product. It contains ordered plugin IDs and semantic-version ranges. Each member remains:

- independently reviewed and published;
- independently signed and downloaded by digest;
- independently consented before installation;
- independently priced and entitled;
- independently activated, updated, rolled back, removed and restored.

## Implemented

- Marketplace `StarterBundle` and `StarterBundleItem` schema plus an additive migration.
- Permission-scoped Platform Admin create, list, publish and withdraw endpoints plus a first-class
  operator screen. Every mutation requires an internal reason and writes its audit event in the
  same database transaction.
- Dedicated `starter_bundles.read/manage/publish` permissions keep bundle curation separate from
  signed plugin-release publication. Marketplace Operators can manage bundles, Auditors are
  read-only, and an additive migration grants the new permissions to existing deployments.
- Publication refuses unapproved plugins or a member without an approved Stable artifact matching
  its declared version range.
- Public catalog resolution filters by the school's core version, currency, active price window and
  exact member version constraint.
- School Plugin Manager displays recommended bundles only after Marketplace linking.
- Paid members use the existing multi-line Marketplace order with existing price IDs and
  entitlements; no bundle price or alternative payment path exists.
- Installation expands into the existing per-plugin signed, checksum-verified, consent-bound
  installer in bundle order.
- The server re-reads the published bundle and rejects browser-added, removed or version-swapped
  plugins.
- Retry resumes safely when an earlier member already exists at the requested version. A partial
  failure names the failed member and every completed member.
- First-run setup remains core-only and cannot accept bundle or plugin bytes.

## Verification

```text
Marketplace starter-bundle and OpenAPI unit tests: 10/10 passed
School Marketplace service tests: 6/6 passed
Starter-bundle architecture contracts: 7/7 passed
Marketplace API TypeScript build: passed
Platform Admin typecheck and production build: passed (`/starter-bundles` emitted)
Platform authorization/OpenAPI/bundle focused tests: 20/20 passed
Platform Admin Playwright discovery: 56 tests found, including 2 bundle governance journeys;
required PR CI installs Chromium and executes the full real-stack suite
Backend physical-core build: passed
Frontend physical-core production build: passed (27 admitted routes)
Prisma schema validation: passed
```

The Marketplace PostgreSQL CI job applies every migration and runs the complete service suite. The
same required job now runs an isolated, self-cleaning certification that creates one free and one
paid plugin release, creates/publishes/discovers/withdraws a bundle, verifies all three audit rows,
and proves withdrawal removes it from the public catalog. The drill passed locally against an
isolated PostgreSQL 16.14 database on 2026-09-28 with two independently resolved members and three
audited lifecycle mutations. The clean-core artifact job runs the architecture contract that
forbids bundle archives or alternate install mechanisms.

The browser suite now creates, publishes and withdraws a real bundle as a Marketplace Operator and
separately proves an Auditor cannot see mutation controls. Those journeys use the existing real
API/PostgreSQL E2E stack; their first hosted execution remains pending.

The required Phase E two-database drill now also publishes a mixed free/paid bundle, discovers it
from a genuinely registered school over the live Marketplace HTTP API, derives the paid order from
the server-resolved bundle price ID, settles it, and refreshes the signed entitlement into the
school database. It then downloads real Ed25519-signed `.wtp` archives through the entitlement-
protected artifact endpoint and uses the real school package verifier, filesystem extraction,
PostgreSQL lifecycle registry and activation path. An injected second-plugin failure proves the
first member remains active; retry reuses it, completes the paid member, independently removes the
free member with data preservation, and reinstalls it without replacing the paid member. On
2026-09-28 the complete drill passed **75/75 checks** against isolated Marketplace and school
databases on PostgreSQL 16.14. The run also caught and corrected an invalid certification fixture:
synthetic package IDs are now correctly namespaced by their signing publisher, matching the
production verifier's trust rule.

## Remaining acceptance

LCF-002 stays partial only for the hosted browser journey and hosted clean-school evidence. The
local Phase E two-database certification and Marketplace PostgreSQL bundle lifecycle are verified.
Discovery, mixed free/paid plan resolution, settlement, entitlement refresh, ordered signed
installation, interrupted retry, independent removal and reinstall all executed successfully.
