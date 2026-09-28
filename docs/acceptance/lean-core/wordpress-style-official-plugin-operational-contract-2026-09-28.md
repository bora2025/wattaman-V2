# WordPress-style official plugin operational contract

Date: 2026-09-28  
Status: **implemented and locally certified for every official plugin**

## Requirement

The WordPress-style package contract requires each plugin to describe how the host operates it, not
only what code it contains. Every official package must expose a runtime health check and declare
its data classification, database/file backup participation, restore verification, uninstall
retention, Marketplace pricing authority, support URL and privacy URL.

## Implementation

- `PluginManifest` parses and validates a backward-compatible `operational` contract.
- The central Marketplace package verifier validates the same optional contract before accepting a
  signed artifact, preventing a package from passing publication and then failing at the school.
- Data classifications use a closed allowlist; unknown labels fail validation.
- Backup participation separately declares database and file ownership; restore verification is
  mandatory.
- Uninstall retention is fixed to `preserve`, preventing silent package-driven data deletion.
- Pricing authority is fixed to `marketplace`, so packages cannot bypass central orders and
  entitlements.
- All 13 official manifests declare this contract, support URL and privacy URL.
- Every official backend entry exports a callable health check returning `{ status: "ready" }`.
- Because manifests and runtime bytes changed, every plugin received a new patch version and
  changelog entry; no already-published artifact version is overwritten.
- Catalog enforcement verifies that migration-bearing plugins participate in database backup and
  storage-capable plugins participate in file backup.
- Legacy third-party schema-v1 manifests remain readable when `operational` is absent. The official
  catalog gate is stricter, providing a compatibility window without weakening Wattanam releases.
- The public SDK implements the same validator and closed classification vocabulary. The plugin CLI
  scaffold emits the complete declaration and its `check` command executes the declared health
  probe. SDK 1.1's local harness now also implements its previously missing parent-resolution and
  guardian-assignment commands, so the advertised developer contract compiles end to end.

## Verification

```text
npm test -- --runInBand src/plugins

Test Suites: 48 passed, 48 total
Tests:       308 passed, 308 total

Marketplace publication verifier: 6/6 passed
Backend and Marketplace API TypeScript builds: passed

Post-version-bump plugin plus Document Designer signed-install regression:
49 suites passed, 310 tests passed

Public plugin SDK: build passed; 2 suites / 14 tests passed
Plugin CLI: 6 suites / 13 tests passed
```

The suite includes manifest rejection tests, all 13 official operational-contract checks, runtime
health execution, package/lifecycle verification and SDK/runtime regression coverage. All 13
manifests also parse as JSON and all backend entries pass `node --check`.

## Remaining boundary

This proves package declarations and the runtime contract. It does not replace portable
backup/restore execution, hosted health monitoring, privacy review, or production support approval
required independently for each plugin.
The current `wattanam.example` support/privacy addresses are non-production placeholders inherited
from the reference plugin; release approval must replace them with public operator-owned endpoints
and verify those endpoints before Stable promotion.
