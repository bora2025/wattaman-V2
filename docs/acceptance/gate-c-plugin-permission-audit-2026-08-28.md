# Gate C Plugin Permission Enforcement and Audit Evidence — 2026-08-28

## Result

Part of C-003 (audit adapter + granular permission evaluation) is implemented: plugin route dispatch now enforces per-route permission grants instead of a blanket SUPER_ADMIN-only gate, and every dispatch attempt is written to the core audit log with actor/plugin/action/outcome. The manifest-declared `permission` string on a route was previously only checked at plugin registration time — nothing enforced it against the calling principal at request time, so in practice only `SUPER_ADMIN` could reach any plugin route at all. That gap is closed. A dedicated plugin-facing notification adapter and frontend enforcement of navigation/page `permission` fields remain outside this increment.

## What changed

- `PluginPermissionGrant` (new model): `(pluginId, permissionId, role)`, admin-managed, independent of plugin activation state so grants survive deactivate/reactivate cycles.
- `PluginPermissionsService`: grants/revokes/lists grants; validates a grant's `permissionId` against the plugin's installed manifest (not just the currently-loaded runtime state) before persisting it; rejects granting to `SUPER_ADMIN` (redundant — it already passes everything) or to any role outside the known set.
- `roleSatisfies` extracted from `RolesGuard` into a shared, exported helper so plugin-permission evaluation reuses the exact same role-inheritance rule as every core `@Roles()` check, instead of a second copy that could drift.
- `PluginExtensionsService.dispatch()`: checks `PluginPermissionsService.isGranted(pluginId, route.permission, principal.role)` before invoking the handler. `SUPER_ADMIN` always passes; every other role needs an explicit (possibly inherited) grant. Every attempt — granted-and-succeeded, denied, or granted-but-handler-failed — calls `AuditService.log()` with actor id/role/email, `PLUGIN_ROUTE` action, the plugin id as resource, method/path, and the permission checked. Audit writes are best-effort and never block or fail the request, matching `AuditService`'s existing contract.
- `PluginApiController`: `@Roles('SUPER_ADMIN')` moved off the controller class and onto `GET /plugin-api/extensions` only. Route dispatch (`ALL /plugin-api/:pluginId/*`) is now reachable by any authenticated user; the permission grant is what actually gates access.
- `PluginsController`: new `SUPER_ADMIN`-only endpoints — `GET/POST /plugins/:id/permission-grants`, `DELETE /plugins/:id/permission-grants/:permissionId/:role` — to manage grants.
- New migration `20260828000000_add_plugin_permission_grants`.

## Automated verification

```text
Plugin + auth suites:  12 passed, 12 total (42 tests)
Full backend suite:    23 passed, 23 total (90 tests)
Backend build (swc):   159 files compiled
TypeScript build:      passed (tsc --noEmit)
Prisma schema validation: passed
```

New coverage: dispatch audits a granted call, denies and audits an ungranted call without invoking the handler, and audits a handler failure without swallowing the original error; grant validation against the manifest, rejection of `SUPER_ADMIN`/unknown-role grants, and rejection of granting an undeclared permission or a not-installed plugin; direct-match, inherited-role, and no-grant/undefined-role cases for `isGranted`; and the extracted `roleSatisfies` helper's direct/inherited/non-inherited/empty-input behavior.

## Open items

- The new migration has not been applied to a live PostgreSQL instance in this environment (no database access this session).
- No plugin has yet called `context.permissions.register(...)` in a way that's been exercised against a real granted role end-to-end through an HTTP request; coverage here is at the service layer (`PluginExtensionsService`/`PluginPermissionsService`), not a full Nest e2e HTTP test.
- A plugin-facing notification-sending SDK capability (the other half of C-003's "audit and notification adapters") is not implemented in this evidence — see [gate-c-plugin-notification-adapter-2026-08-28.md](./gate-c-plugin-notification-adapter-2026-08-28.md), which closes it the same day.
- Frontend navigation/page rendering does not yet consult a user's granted plugin permissions to hide entries they cannot use — today a denied user would see a navigation link that then 403s on click.
