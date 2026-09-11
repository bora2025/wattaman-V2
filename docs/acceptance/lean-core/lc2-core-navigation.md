# LC2-009 core navigation acceptance

Status: **accepted** on 2026-09-11.

## Approved core surface

The `coreAdminHrefs` registry contains exactly these destinations, in navigation order:

1. Dashboard — `/admin`
2. Users — `/admin/users`
3. Plugins — `/admin/plugins`
4. Marketplace — `/marketplace`
5. Settings — `/admin/settings`
6. Backup/Restore — `/admin/backup`
7. Updates/Health — `/admin/system`
8. Platform Billing — `/admin/platform-billing`
9. Audit/Security — `/admin/audit`

Search, profile, licensing and all school-business links remain available to `legacy-full` but are
not classified as core navigation. Plugin links remain permission-filtered dynamic contributions.

`/admin/system` is guarded for `SUPER_ADMIN` and `ADMIN` and summarizes the existing protected
diagnostics and updates APIs. Update installation remains on the plugin-management screen, avoiding
a second mutation implementation.

## Verification

- A repository contract locks the exact ordered core href set.
- Frontend production build validates every destination, including the new system page.
- Architecture inventory and repository tool gates pass.

