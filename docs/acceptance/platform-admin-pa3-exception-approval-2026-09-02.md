# Platform Admin PA-3 Exceptional Entitlement Approval — 2026-09-02

## Scope

This increment closes the PA3-7 implementation gap for exceptional unpaid access to a paid plugin
and entitlement validity longer than the ordinary 90-day maximum. It does not claim PA3-8's hosted
registered-school end-to-end evidence.

## Controls implemented

- additive `SchoolPluginRequestExceptionApproval` record and migration;
- exactly one proposal per request and unique proposal/decision idempotency keys;
- PostgreSQL checks require 1–3650 validity days, a different deciding operator, and internally
  consistent pending/decided fields;
- only approved, non-feature, non-purchase requests may propose an exception;
- an unpaid paid-plugin entitlement cannot issue until the exception is independently approved;
- ordinary non-trial grants are capped at 90 days unless an approved exception supplies duration;
- every proposal and decision records named operator, reason, correlation ID, request, and audit
  metadata;
- `/platform/v1` routes, OpenAPI permissions, strict Next.js proxy allowlist, and operator controls
  cover proposal, second approval, rejection, status, actors, duration, and reason.

## Verification

- Prisma client generation: passed.
- Prisma schema validation with a non-secret validation URL: passed.
- Marketplace API TypeScript production build: passed.
- Platform Admin Next.js production build: passed.
- Marketplace API tests: **25 suites, 178 tests, all passed**.
- Focused tests reject initiator self-approval and prove an independently approved 180-day grant
  produces the matching signed-entitlement expiry and decision evidence.

## Remaining hosted gate

Apply the migration to disposable PostgreSQL and exercise two real operator sessions plus a real
registered school as part of PA3-8. Local mocks and builds do not satisfy that hosted gate.
