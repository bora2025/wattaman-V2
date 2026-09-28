# Lean core has no optional runtime — 2026-09-28

## Result

LCF-006 is complete. The physical core bundle contains no optional business provider, controller,
scheduled job, queue processor, resolver, or WebSocket gateway, and the same bundle is booted by the
required isolated core deployment smoke job.

## Enforcement

`tools/verify-clean-core-artifact.js` derives optional module directories from the authoritative
distribution registry. In addition to rejecting optional module directories and module symbols, it
now discovers every decorated runtime class in those directories and searches every compiled core
JavaScript artifact for those symbols.

Covered runtime decorators are:

- `Injectable`;
- `Controller`;
- `WebSocketGateway`;
- `Processor`;
- `Resolver`;
- `Cron`, `Interval`, and `Timeout` scheduling sites.

Any match produces an `optional-runtime-symbol-bundled` violation and fails the release gate. This
closes the gap where an optional provider could have been imported indirectly without its Nest
module class being present.

## Evidence

- focused verifier suite: 8/8 passing, including a provider-without-module negative fixture;
- the current `backend/dist-core` and isolated frontend artifact pass with zero violations;
- the architecture/ownership tooling suite passes 92/92;
- PR validation builds these exact physical artifacts, runs the strengthened gate, then boots the
  core API/web/database/gateway stack in the `core-deployment-smoke` job.

LCF-006 does not imply hosted Railway approval or real-device/plugin pilot completion; those remain
separate final gates.
