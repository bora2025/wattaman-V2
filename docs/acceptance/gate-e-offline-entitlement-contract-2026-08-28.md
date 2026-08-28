# Gate E Offline Entitlement Contract Evidence — 2026-08-28

## Scope

This evidence closes the cryptographic contract portion of E-004. It does not close Gate E2 or authorize paid plugins. Database-backed issuance after a committed payment, school cache integration, key custody/rotation, outage certification, refunds, and provider integration remain required.

## Implemented contract

- Ed25519 signature over deterministic canonical JSON.
- A key ID in both the signed payload and signature envelope; mismatches and unknown keys fail closed.
- Fixed `wattanam-school` audience plus exact installation and product binding.
- Schema version, UUID token ID, customer, licensed major range, issuer, feature list, and 128-bit random nonce.
- Issued, not-before, expiry, update-access, and offline-recheck timestamps with ordering constraints.
- Local verification uses only pinned public keys and does not contact the marketplace.
- Tampering, wrong-installation use, unknown keys, and elapsed offline-recheck windows are rejected by tests.

The repository-metadata signer remains a separate implementation. Production wiring must supply an independently generated entitlement key and reject reuse during E-004 key-custody work.

## Verification

From `apps/marketplace-api`:

```text
npm.cmd test
Test Suites: 3 passed, 3 total
Tests:       11 passed, 11 total

npm.cmd run build
tsc -p tsconfig.json
exit code 0
```

Evidence sources: `src/entitlement.ts` and `src/entitlement.spec.ts`.
