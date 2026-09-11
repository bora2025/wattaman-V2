# LC2-013 core empty experience acceptance

Status: **accepted** on 2026-09-11.

## Experience

A fresh core installation states that attendance, classes, finance, transport and other optional
modules are intentionally absent. It does not show empty cards or links to legacy module pages.
Instead, the dashboard presents three actions:

1. Link the marketplace account through `/admin/plugins`.
2. Browse verified plugins through `/marketplace`.
3. Install and activate selected plugins through `/admin/plugins`.

Progress is based on `/api/admin/marketplace/link/status` and the active, permission-filtered plugin
extensions already used for dashboard cards. The flow therefore shows actual installation state,
not a browser-only dismissed flag. Once an active plugin contributes navigation, the empty flow is
replaced by its feature card.

## Safety and compatibility

- Every onboarding destination is admitted by the `core` route policy.
- No optional business API or route is linked from the empty state.
- Marketplace linkage uses the existing secure approval flow; the dashboard never handles marketplace
  credentials or tokens.
- `legacy-full` continues to mount the existing business dashboard and does not see this onboarding.

## Verification

- Tests prove fresh and linked/active progress states.
- Tests prove every CTA is core-admitted and the UI reads real marketplace link status.
- Frontend production build, architecture inventory and repository tool gates pass.

