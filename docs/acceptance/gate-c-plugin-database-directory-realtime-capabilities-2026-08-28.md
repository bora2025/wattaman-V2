# Gate C Plugin Database, Directory, and Realtime Capabilities — 2026-08-28

## Result

Adds three new SDK 1.0 runtime capabilities — `database.read`/`database.write`, `directory.read`, and `realtime.notify` — that close the prerequisite gap found while investigating **C-004** (move announcements business data/API ownership to the official plugin). Before this change the plugin SDK gave a running plugin exactly two kinds of persistence: one-time migration SQL (applied once at install) and a namespaced filesystem key-value store (`storage.read`/`storage.write`). Nothing let a plugin's route/job/event handler query or write its own migrated tables while serving a live request, and nothing let a plugin resolve "who should receive this" without directly joining core `User`/`Class`/`Student`/`NotificationPreference` tables — which plugin migrations are hard-namespaced away from. This change adds those primitives, tested and verified live on real PostgreSQL 16. **This is not the announcements cutover itself** — `plugins/announcements/` is untouched by this change, and its README still correctly states the business-data cutover is deferred; this closes the SDK-capability blocker so that cutover can be built as a normal-sized follow-up.

## What changed

- **`database.read` / `database.write`** (`plugin-runtime.service.ts`): `context.database.query(sql, params)` / `context.database.execute(sql, params)`. Both always use Prisma's parameter-binding form (`$queryRawUnsafe`/`$executeRawUnsafe` with a separate `params` array) — a plugin can never string-concatenate values into the executed SQL text. Both are guarded by the same forbidden-operation and `plugin_<id>_`-namespace checks the migration system already enforced at install time (`plugin-migrations.service.ts`), now extracted into a shared `plugin-sql-guard.ts` so both call sites enforce identically instead of duplicating the regex. `query` additionally requires the statement to start with `SELECT`; `execute` requires `INSERT`/`UPDATE`/`DELETE` — schema changes (`CREATE`/`ALTER`/`DROP`) stay reserved for reviewed migrations, never available at runtime.
- **`directory.read`**: new `DirectoryService` (`backend/src/directory/`) extracts the recipient-resolution logic that used to live only as private methods on `AnnouncementsService` (`resolveRecipients`/`isAllowed`), generalized as `resolveAudience({ audience, targetRole?, classId? })` returning each recipient plus their per-channel eligibility (in-app/email/SMS), honoring `NotificationPreference` exactly as before. `AnnouncementsService` now calls this shared service instead of its own copy — a behavior-preserving refactor, not a duplication. Exposed to plugins as `context.directory.resolveAudience(...)`, so a plugin can ask "who should get this" without ever touching core tables directly.
- **`realtime.notify`**: new `PluginRealtimeService` wraps `MessagesGateway`. `context.realtime.notifyUser(userId, event, payload)` always emits under `plugin:<pluginId>:<event>` — the prefix is applied by the service, not the plugin, so a plugin can never spoof a core socket event name (`message:new`, `announcement:new`, ...) or another plugin's event namespace.
- **`GRANTABLE_PLUGIN_ROLES`** (`plugin-permissions.service.ts`) extended to include `TEACHER`, `STUDENT`, `PARENT` alongside the existing admin-hierarchy roles. Confirmed safe by reading `roles.guard.ts`: these three roles have no entry in `ROLE_INHERITS` (that table only encodes the admin-hierarchy branch), so this only makes granting a plugin permission to those roles *possible* through the existing admin-only grant flow — it changes no existing authorization outcome by itself.

## Live PostgreSQL verification (Docker, postgres:16-alpine, disposable)

Ran the real `PluginRuntimeService`, `DirectoryService`, and `PluginRealtimeService` classes (stubbing only package-signature verification, `PluginExtensionsService`/jobs/settings/storage — unrelated to this evidence, and a stub Socket.IO room object in place of a live socket connection) against a fresh container with all five checked-in backend migrations applied via `prisma migrate deploy`, seeding real `User`/`Class`/`Student`/`NotificationPreference` rows and a real plugin-namespaced table created by an actual applied migration.

```text
== C-004 prerequisite: database/directory/realtime capabilities on real PostgreSQL ==
PASS database.execute inserts a row into the plugin's own namespaced table
PASS database.execute updates that row
PASS database.execute deletes that row
PASS database.query rejects a non-namespaced table live, not just at migration time
PASS directory.resolveAudience(SCHOOL) returns every seeded user from the real User table
PASS the real NotificationPreference row (announcementsEnabled=false) is honored -- outsider's channels are all off
PASS directory.resolveAudience(CLASS) returns exactly the teacher, student, and parent from real Class/Student joins
PASS realtime.notifyUser emits to the right user room under a plugin-namespaced event

== capability gating still holds against a real plugin load, not just mocks ==
PASS a plugin that only declared database.read is rejected live when it calls execute()

ALL CHECKS PASSED (9/9)
```

The namespace-rejection check attempted `SELECT * FROM "User"` through a plugin that had legitimately declared `database.read` — proving the guard blocks cross-boundary access by table name, not merely by missing capability.

## Automated unit verification (part of the regular suite)

```text
Full backend suite: 27 passed, 27 total (120 tests, +12 from this change)
Backend build (swc): 167 files compiled
TypeScript build: passed (tsc --noEmit)
```

New/changed spec coverage: `plugin-sql-guard.spec.ts` (new — namespace and forbidden-operation checks in isolation), `directory.service.spec.ts` (new — SCHOOL/ROLE/CLASS resolution and preference-channel logic against a mocked Prisma client), `plugin-realtime.service.spec.ts` (new — event prefixing, including an explicit "cannot forge a bare core event name" case), and additions to `plugin-runtime.service.spec.ts` (capability-gating for all three new capabilities, mirroring the existing `notifications.send` test pattern). `plugin-migrations.service.spec.ts` required no changes — its behavior is unchanged, only its implementation now calls the shared guard functions.

## Open items

- The actual announcements business-data cutover (moving `Announcement`/`AnnouncementRead` content into plugin-owned tables, redirecting the six existing REST routes, and the accompanying copy/verify/rollback script) is still not done — this change only removes the SDK blocker that made it impossible. `plugins/announcements/` is unchanged.
- `database.query`/`database.execute` intentionally forbid DDL — a plugin cannot alter its own schema at runtime, only through reviewed migrations. This is a deliberate scope boundary, not a gap.
- No load test exists for concurrent `database.write` calls from the same plugin against the same row — Postgres's own row-level locking applies as it would to any other raw SQL caller, but this wasn't specifically exercised here.
- `realtime.notifyUser` was verified against a stub Socket.IO room object, not a real browser socket connection — the room/event addressing matches `MessagesGateway`'s existing convention exactly (`user-<id>` room), which is real, tested code unchanged by this session.
