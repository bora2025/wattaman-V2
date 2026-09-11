# LC2-010 frontend route policy acceptance

Status: **accepted** on 2026-09-11.

## Enforcement

`frontend/proxy.ts` applies the distribution policy before rendering a page. In `core`, an
unavailable application route is rewritten to the framework not-found page with HTTP 404; hiding a
navigation item is therefore not the security or availability boundary.

The allow-list in `frontend/lib/route-policy.ts` covers:

- public installation and authentication routes;
- approved administrator core operations;
- generic profile, notification, appearance and licensing support surfaces;
- marketplace and plugin-host routes;
- API proxy routes (the core backend independently omits business controllers);
- exact teacher/student portal shells for the upcoming extension-backed empty experience;
- framework and public static assets.

Attendance, academic management, finance, reporting, HR, transport, learning, communications,
parent, employee, accountant and Wattanam legacy pages are unavailable in `core`. `legacy-full`
continues to admit every route.

## Verification

- Contract tests exercise representative core, plugin, and business paths for both distributions.
- Tests prove trailing slashes cannot bypass the boundary.
- Frontend production build validates the Next.js proxy and policy integration.
- Architecture inventory and repository tool gates pass.

