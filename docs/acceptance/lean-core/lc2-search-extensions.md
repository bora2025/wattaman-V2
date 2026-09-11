# LC2-012 search extensions acceptance

Status: **accepted** on 2026-09-11.

## Provider contract

The frozen SDK 1.0 capability list is unchanged. A plugin becomes searchable by using its existing
`api.routes` capability to register a permission-gated `GET search` route. Its handler receives the
normalized query in `request.query.q` and returns up to 25 records shaped as:

```json
{ "id": "record-id", "title": "Result title", "description": "Optional", "href": "/plugins/plugin.id/path" }
```

`PluginExtensionsService.searchForPrincipal` discovers providers from the active runtime route map.
It calls each through the normal dispatch path, preserving permission evaluation, the 10-second
timeout and audit logging. Results with invalid identifiers, oversized text, cross-plugin links or
path traversal are discarded. A denied or failed provider cannot break other providers.

## Frontend composition

- `core` mounts `CorePluginSearch`, which calls only `/api/plugin-api/search`.
- `legacy-full` retains the current user/profile/attendance/fees/scores/schedule search.
- The core component contains no legacy user-profile or business API dependency.
- Search is intentionally not added to the exact primary core navigation; plugins and future command
  palettes may link to `/admin/search`, which is admitted by the core route policy.

## Verification

- Backend tests cover permission filtering, provider isolation, namespace validation and query bounds.
- Frontend boundary tests prove core does not mount or import legacy business search behavior.
- Backend/frontend builds, architecture inventory and repository tool gates pass.

