# Phase E Customer Portal and Protected Catalog — 2026-08-29

## Implemented journeys

- `GET /v1/catalog` exposes approved products, publisher, license, active prices, changelog, release metadata, and versions compatible with the requested core semantic version. Anonymous responses contain no customer ownership data.
- An authenticated marketplace account sees ownership separately for each registered school, including active/refunded/revoked/expired status and update/expiry windows.
- `POST /v1/customer/orders` derives the customer from the hashed server session and verifies the public installation ID belongs to that account before invoking the existing idempotent server-priced order ledger.
- Customer order history and entitlement export are account-scoped. The customer portal holds the marketplace session only in a Secure/HttpOnly/SameSite cookie maintained by the Next.js server proxy; bearer tokens are not placed in browser storage or returned to client code.
- Paid artifact bytes require either an authenticated account with a currently active entitlement/update window or a fresh school signature bound to installation ID and the exact SHA-256. The digest binding prevents replay for another artifact. Free approved artifacts remain anonymously downloadable.
- The school licensing UI supports refresh, status/error display, signed-token export, and offline import. Offline import independently verifies signature, key ID, installation, product, validity window, and tampering before changing the cache, and it never contacts the marketplace.
- The `/marketplace` UI provides compatible/incompatible catalog states, product/version/license/changelog/pricing, sign-in with MFA/recovery code, owned status, order/manual-invoice request, protected download, offline token export, and actionable errors. The admin licensing page links to it.

## Verification

- Marketplace: 13 suites/114 tests pass; focused catalog/checkout/download tests cover compatibility, derived ownership, cross-account rejection, and active-entitlement enforcement.
- School marketplace boundary: 6 suites/45 tests pass; the cache suite includes valid offline import, tamper rejection without overwrite, and export.
- Cross-service E-010 matrix: 23/23 checks pass for purchase→token→offline→renewal/refund/outage/key rotation.
- Marketplace and backend production builds pass. The frontend production build compiled, type-checked, generated all 116 static pages, and exited successfully; unrelated pre-existing lint warnings remain.
- `.github/workflows/phase-e-commerce-certification.yml` provisions PostgreSQL 16, applies every marketplace migration, and runs these contracts/builds on relevant pull requests or manual dispatch.

## Remaining gate evidence

This closes the implementation gap for E-006 and E-011, but browser automation against a deployed marketplace and live PostgreSQL migration/application evidence still remain before their boxes can be marked fully verified. E-001 also remains gated on transactional email-provider selection and privacy review. Product/finance/legal decisions still gate E0/E1/E3.
