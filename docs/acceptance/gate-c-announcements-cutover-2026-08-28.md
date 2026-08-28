# Gate C Announcements Cutover — 2026-08-28

## Result

**C-004** (move announcements business data/API ownership to the official plugin) is complete. `plugins/announcements/` now owns the full feature — content, storage, and all six routes — and core's `/announcements/*` controller is a thin, Prisma-free proxy into the plugin's dispatch. All 15 live-PostgreSQL checks pass, including running the real, committed `backend/scripts/announcements-cutover.js` as a subprocess against real legacy `Announcement`/`AnnouncementRead` rows.

## What changed

- **Two new plugin migrations** (`plugins/announcements/migrations/002_create_announcement.sql`, `003_create_announcement_read.sql`) create `plugin_wattanam_announcements_announcement`/`_announcement_read`. The read table carries a real in-namespace `REFERENCES ... ON DELETE CASCADE` FK to the announcement table (allowed — both tables share the plugin's own `plugin_wattanam_announcements_` prefix); neither table has a SQL FK to core `User`/`Class` (blocked by the namespace guard, as designed).
- **The plugin (`plugins/announcements/backend/index.js`) gained the six routes** that used to be core's `AnnouncementsController`/`AnnouncementsService`: `all`, `feed`, `unread-count`, `read`, `create`, `remove`, using `context.database.query/execute` against its own tables. The teacher-forced-`CLASS`-audience rule (previously inline in the core controller) now lives in the plugin's `create` handler, since the plugin is the sole authority on its own business rules.
- **Three new `DirectoryService` methods** (`lookupUsers`, `lookupClasses`, `classesForUser`) close two contract gaps found while building the routes: the plugin needs to display live author/class names without a SQL join into core tables, and needs the reverse of audience resolution — "which classes is *this* caller in" — to filter a personal feed. Exposed under the already-declared `directory.read` capability, no new capability string.
- **One new `NotificationService` method** (`notifyInApp`) closes a third gap: in-app delivery has always written a row to the shared, cross-feature `Notification` table (confirmed by grep: 7 other core modules write it — assignments, class-registrations, courses, exam, parent, notification digest — plus a generic `admin/notifications` consumer). The plugin calls `context.notifications.notifyInApp(...)` under its already-declared `notifications.send` capability; core keeps owning that table, it only stops owning `Announcement`/`AnnouncementRead`.
- **Core's `AnnouncementsController`** (`backend/src/announcements/`) is rewritten to a ~40-line proxy: six handlers, each a one-line `dispatch()` call. `AnnouncementsService` is deleted. No `@Roles()` decorators remain — authorization is entirely the plugin's permission grants, the same model `PluginApiController` already uses. Since the plugin router has no path-parameter matching (confirmed by reading `plugin-extensions.service.ts`), the dynamic `:id` from `PATCH /announcements/:id/read` and `DELETE /announcements/:id` travels through the dispatch `body` to static plugin paths (`read`, `remove`) instead of the URL — the core-facing URLs and frontend are unaffected.
- **`frontend/lib/messageSocket.ts`**: one string changed — the realtime capability's mandatory `plugin:<id>:` event prefix means the socket listens for `plugin:wattanam.announcements:announcement:new` instead of the old bare `announcement:new`. No other frontend file changes; all six REST paths, request/response shapes, and React Query keys are unchanged.
- **`backend/scripts/announcements-cutover.js`** (new): a `legacy-adopt.js`-shaped, journaled, resumable script — backup (skipped under `NODE_ENV=test`, matching `plugin-migrations.service.ts`'s own precedent, since this host has no local `pg_dump`) → copy every `Announcement`/`AnnouncementRead` row into the plugin tables (`ON CONFLICT (id) DO NOTHING`, safe to resume) → verify row counts match → grant `wattanam.announcements.read` to `ADMIN, SCHOOL_ADMIN, TEACHER, STUDENT, PARENT` and `.manage` to `ADMIN, SCHOOL_ADMIN, TEACHER`, replicating the old `@Roles()` sets exactly (carrying forward an existing authorization decision, not granting new trust).
- **Rollback plan**: additive only. Core's `Announcement`/`AnnouncementRead` Prisma models and rows are **not** dropped — verified live: after the cutover script ran and the plugin served (and even deleted) data, the original core row was untouched. Dropping the old tables is an explicit, deliberately deferred follow-up once the plugin has run in production for a support window. Rollback is: revert this commit; the old controller/service come back byte-for-byte, and no data was ever destroyed.

## Live PostgreSQL verification (Docker, postgres:16-alpine, disposable)

Ran the real classes end-to-end — `PluginExtensionsService`, `PluginRuntimeService`, `DirectoryService`, `NotificationService`, `PluginRealtimeService` — against a fresh container with all five backend migrations applied, the plugin installed from its actual on-disk manifest/migrations (not a synthetic fixture), and the real, committed `announcements-cutover.js` run as an actual subprocess:

```text
== installing wattanam.announcements at its real on-disk path (real manifest, real migrations) ==
PASS all 3 real plugin migrations applied cleanly

== running the real announcements-cutover.js script ==
PASS announcements-cutover.js exits 0
PASS cutover script reports state=granted with correct counts
PASS the legacy announcement row exists in the plugin table with matching content
PASS permission grants preserve today's access (read: 5 roles, manage: 3 roles)

== loading the real plugin and dispatching every route through the real proxy path ==
PASS GET all returns the migrated legacy announcement enriched with author name and a read count
PASS GET feed (student) sees the SCHOOL-wide legacy announcement, unread
PASS GET unread-count (teacher, who already read the legacy announcement) is 0
PASS PATCH read marks it read
PASS the feed now shows it as read for the student
PASS POST create (teacher) forces audience to CLASS even though SCHOOL was requested
PASS the fan-out wrote a real core Notification row (core still owns its own inbox table)
PASS the fan-out emitted a plugin-namespaced realtime event to the class teacher
PASS DELETE remove succeeds
PASS the row and its read receipts are gone (in-namespace FK cascade worked)

== the core Announcement/AnnouncementRead tables are untouched (rollback path) ==
PASS the original core Announcement row still exists, deleting from the plugin never touched it

ALL CHECKS PASSED (15/15)
```

## Automated unit verification (part of the regular suite)

```text
Full backend suite: 29 passed, 29 total (133 tests, +19 from this change)
Backend build (swc): 168 files compiled
TypeScript build: passed (tsc --noEmit)
```

New/rewritten spec coverage: `reference-plugin.spec.ts` now exercises all 8 registered routes (was 2) including validation errors, the teacher-forced-CLASS rule, and channel-eligibility-aware fan-out with mocked I/O; `announcements.controller.spec.ts` (new) proves the proxy's URL→dispatch translation for all six routes; `directory.service.spec.ts` and `plugin-runtime.service.spec.ts` gained cases for the four new context methods; `notification.service.spec.ts` (new) covers `notifyInApp`.

## Open items

- FL/product sign-off that today's `@Roles()`-equivalent grant set (read: ADMIN/SCHOOL_ADMIN/TEACHER/STUDENT/PARENT, manage: ADMIN/SCHOOL_ADMIN/TEACHER) is exactly the intended access policy has not happened — the cutover script preserves prior behavior exactly, but no one has been asked to re-approve it as a stated policy.
- Dropping the now-unused core `Announcement`/`AnnouncementRead` Prisma models/tables is deliberately deferred, not forgotten — tracked as a future cleanup once the plugin has run in production through a support window.
- The cutover script's backup step was verified skipped-under-test (matching `plugin-migrations.service.ts`'s existing precedent); `backup-database.js` itself was not independently re-verified in this session — it's covered separately by OPS-003.
- No test exercises a school with actually large `Announcement` history (thousands of rows) through the cutover script's row-by-row copy loop; at real-world single-school scale this is expected to be fine, but it wasn't load-tested.
