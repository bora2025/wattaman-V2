# LC2-008 frontend navigation registry acceptance

Status: **accepted** on 2026-09-11.

## Boundary

`frontend/lib/navigation-registry.ts` defines the only three navigation sources: `core`,
`legacy-business` and `plugin`. It validates the public frontend distribution, defaults existing
deployments to `legacy-full`, filters static registrations by distribution, and accepts plugin
contributions only when they include a plugin identity.

`frontend/lib/admin-nav.ts` is now a reviewed registration source rather than an unclassified array.
All existing links retain their legacy order. A core selection removes every legacy business link.
`Sidebar` converts the permission-filtered `/api/plugin-api/my-extensions` response into identified
plugin registrations and uses the common composer instead of directly concatenating arrays.

This item establishes contribution ownership. LC2-009 defines the final core navigation set and
LC2-010 enforces matching route availability.

## Verification

- Registry behavior tests prove distribution filtering, identified plugin contributions, safe
  defaulting and invalid-profile rejection.
- Frontend TypeScript/build validates the registry integration.
- Architecture inventory gate and repository tool tests pass.
