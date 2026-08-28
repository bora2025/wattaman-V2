# Gate C Frontend Permission Enforcement, Notification Auditing, and Sending Quota — 2026-08-28

## Result

Closes the three remaining C-003 items. **Frontend page/nav permission enforcement**: any authenticated role can now discover and reach plugin pages they've been granted, not just `SUPER_ADMIN`. **Notification-send auditing**: every `context.notifications.*` call is now audit-logged (granted/denied/succeeded/failed), mirroring how route dispatch already was. **Per-plugin sending quota**: a daily cap, enforced by a single atomic upsert-increment, verified under real concurrent load against real PostgreSQL.

## What changed

- **`PluginExtensionsService.listForPrincipal(role)`** (new): the non-admin counterpart to `list()`. Filters navigation entries to those with no declared `permission`, or one `PluginPermissionsService.isGranted` confirms for the caller's role — the same rule `dispatch()` itself enforces, so nothing is exposed here that a route wouldn't already allow. Pages are returned unfiltered (they carry no `permission` field of their own; the routes behind them are the real gate).
- **`GET /plugin-api/my-extensions`** (new, `PluginApiController`): authenticated, any role — unlike `GET /plugin-api/extensions` (`SUPER_ADMIN`-only, still used for the admin plugin-management overview).
- **`frontend/components/Sidebar.tsx`**: fetches `my-extensions` once per session and merges granted plugin nav into the scrollable nav list and mobile "More" drawer (never into the curated bottom-tab picks, so it can't disturb `pickBottomTabs`'s per-role tuning). A fetch failure or empty grant set silently shows nothing — plugin nav is additive, never required.
- **`frontend/app/plugins/[pluginId]/[[...path]]/page.tsx`**: the generic plugin settings-page host no longer hard-gates on `SUPER_ADMIN` (`AuthGuard` now allows any authenticated role); it also now calls `my-extensions` instead of the admin-only `extensions` endpoint for its own title lookup, so a non-admin gets the same nice page title an admin does. Real authorization is unchanged — still enforced server-side by `dispatch()`, surfaced to the user as the `ForbiddenException` message when a grant is missing.
- **`PluginRuntimeService.sendNotification(...)`** (new private helper): every `sendEmail`/`sendSms`/`notifyInApp` call now routes through one atomic quota-check-and-increment, then audit-logs the outcome (`action: 'PLUGIN_NOTIFICATION_SEND'`) whether denied, failed, or succeeded — a denied send never reaches the email/SMS provider at all.
- **`PluginNotificationQuotaService`** (new) + **`PluginNotificationUsage`** table (migration `20260828080000`): one row per plugin per UTC day. `recordAndCheck` is a single `INSERT ... ON CONFLICT (pluginId, windowStart) DO UPDATE SET count = count + 1 RETURNING count` — the increment and the read of the resulting count happen in one round-trip, so concurrent callers can never all read a stale count and jointly overshoot the limit. Default 200/day, configurable via `PLUGIN_NOTIFICATION_DAILY_LIMIT`.

## Live PostgreSQL verification (Docker, postgres:16-alpine, disposable)

```text
== per-plugin daily notification quota, atomic under real concurrency ==
PASS exactly 10 of 25 concurrent sends are allowed under a limit of 10 (no race overshoot)
PASS the returned counts are exactly 1..25 with no duplicates or gaps (atomic increment)
PASS a new UTC day resets the counter to 1

== notification-send audit trail (via the real AuditService against real Postgres) ==
PASS both the successful and denied sends produced a real AuditLog row

== listForPrincipal filters navigation by real PluginPermissionGrant rows ==
PASS before any grant exists, TEACHER only sees the unpermissioned entry
PASS after a real PluginPermissionGrant row exists, TEACHER sees both entries
PASS an ungranted role (STUDENT) still only sees the unpermissioned entry
PASS SUPER_ADMIN implicitly sees everything without an explicit grant

ALL CHECKS PASSED (8/8)
```

The concurrency check is the load-bearing one: 25 simultaneous `recordAndCheck` calls against a limit of 10 produced exactly 10 allowed and counts `1..25` with no duplicate or skipped value — proof the single-statement upsert-increment serializes correctly at the database level rather than racing in application code.

## Automated unit verification (part of the regular suite)

```text
Full backend suite: 30 passed, 30 total (139 tests, +6 from this change)
Backend build (swc): 170 files compiled
TypeScript build: passed (tsc --noEmit)
```

New/changed coverage: `plugin-notification-quota.service.spec.ts` (new), `plugin-extensions.service.spec.ts` gained a `listForPrincipal` case, `plugin-runtime.service.spec.ts` gained quota-denial and successful-send audit cases.

## Open items

- The frontend Sidebar/page-host changes were verified by code review and the backend contract they depend on (`my-extensions`); no browser-driven E2E exists for them yet, consistent with this project's still-open B-004/INS-004 browser-automation gap.
- The quota is one combined counter across all three channels (email/SMS/in-app) rather than per-channel; revisit if a real plugin's usage pattern needs finer granularity.
- No UI exists yet for an admin to view/adjust a plugin's quota or see its current usage — the limit is a single global env var for now.
