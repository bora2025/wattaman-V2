# WordPress-style plugin installation consent evidence

Date: 2026-09-25  
Scope: initial Marketplace installation decision

## Implemented behavior

The customer catalog now returns a bounded disclosure derived from the approved release's signed
manifest. Before installation, the school owner can inspect:

- requested runtime capabilities and granular permissions;
- required and optional plugin dependencies with version ranges;
- migration count and whether any migration is declared destructive;
- the core retention rule: deactivate/remove preserve data and reinstall adopts it.

The install action is disabled while a required dependency is not active. Choosing **Review &
install** presents the full disclosure for explicit confirmation.

## Server enforcement

Marketplace supplies a SHA-256 consent digest over a canonical, sorted disclosure. The school sends
that digest with the install request. The school backend recomputes it from the manifest in the
repository-signed update index before any artifact download. A missing or stale digest fails closed
and asks the owner to review again. Therefore adding a capability, permission, dependency or
destructive migration invalidates old consent even if a caller bypasses the browser UI.

Package paths and other repository internals are excluded from the customer disclosure and digest.

## Verification

- `apps/marketplace-api/src/customer-marketplace.service.spec.ts`: catalog disclosure and bounded
  public response.
- `backend/src/marketplace/plugin-install-consent.spec.ts`: canonical ordering and material-change
  invalidation.
- `backend/src/marketplace/marketplace-commerce.service.spec.ts`: missing/stale consent is rejected
  before download; valid consent permits the signed installation pipeline.
- lean-core frontend production build: Plugin Manager disclosure and consent UI compile into the
  physical core artifact.

This evidence covers initial installation. Update comparison and rollback decision UX remain open in
Phase 1 and are not claimed here.
