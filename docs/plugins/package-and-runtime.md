# Signed Plugin Package and Runtime — SDK 1.0 (frozen)

Status: **SDK 1.0 is frozen** (C-006, 2026-08-28). The capability list, manifest schema, and `PluginRuntimeContext` interface below are the complete, stable contract a plugin author can build against. See [Compatibility and freeze policy](#compatibility-and-freeze-policy) for what "frozen" guarantees and how a future SDK 2.0 would be introduced. `plugin-sdk-contract.spec.ts` pins the exact capability list and version constants in CI so an accidental change fails loudly.

## Trust model

Wattanam plugins are trusted in-process server code. Capability declarations define the supported SDK and review surface; they are not an operating-system sandbox. Only packages signed by explicitly trusted publisher keys may be installed. The API container therefore runs as a non-root user, private signing keys stay outside installations and Git, and third-party publishing remains closed until governance and review are operational (Gate C0; see DEC-011).

Plugins do not receive Nest's container, Prisma, database credentials, or unrestricted filesystem paths directly. Every capability below is a narrow, purpose-built method that mediates access — a plugin never gets a raw connection or an unscoped query surface.

## Signed package

A `.wtp` file is a ZIP archive containing:

```text
plugin.json
checksums.json
signature.json
backend/...
frontend/...       # declarative JSON page descriptors
migrations/...     # signed, namespaced SQL
README.md
CHANGELOG.md
```

`checksums.json` lists every payload file with SHA-256. `signature.json` contains the publisher's Ed25519 signature over the exact checksum document. The verifier rejects missing/extra files, malformed checksums, tampering, unknown publisher keys, invalid signatures, unsafe or duplicate paths, symlinks, archive bombs, incompatible versions, missing entry points, and migration checksum mismatches.

Generate an external signing pair and build deterministically, using the public `wattanam-plugin` CLI (`packages/plugin-cli` — see [C-008's developer tooling](#developer-tooling)):

```bash
npx wattanam-plugin keygen /secure/signing/wattanam-2026
npx wattanam-plugin pack \
  --source plugins/announcements \
  --private-key /secure/signing/wattanam-2026/plugin-signing-private.pem \
  --key-id official-2026 \
  --out artifacts/wattanam-announcements-0.1.0.wtp
```

Configure only the public key through `PLUGIN_TRUSTED_KEYS_FILE`, using publisher then key ID as the JSON hierarchy.

## Manifest v1

The contract includes identity, semantic version, core range, publisher, license, backend and declarative frontend entries, SDK/runtime ranges, capabilities, namespaced permissions, dependencies, immutable migrations, navigation, languages, and HTTPS support/privacy URLs.

```json
{
  "schemaVersion": 1,
  "id": "publisher.plugin-name",
  "name": "Display Name",
  "description": "Purpose",
  "version": "1.0.0",
  "requiresCore": ">=0.1.0 <1.0.0",
  "publisher": "publisher",
  "license": "commercial",
  "backendEntry": "backend/index.js",
  "frontendEntry": "frontend/page.json",
  "sdkVersion": "1.0.0",
  "runtimeVersion": "1.0.0",
  "capabilities": ["api.routes", "database.read", "database.write", "directory.read", "notifications.send", "realtime.notify", "settings.read", "ui.pages"],
  "permissions": ["publisher.plugin-name.read"],
  "dependencies": {},
  "migrations": [],
  "navigation": [],
  "supportedLanguages": ["en"]
}
```

Unknown capabilities fail validation. Navigation and frontend paths must be plugin-namespaced. SDK/runtime requirements must include the core's `1.0.0` contract.

## Inspection and lifecycle

Installation is deliberately two-stage:

```text
signed package
  ↓ verify and inspect
preview publisher, compatibility, dependencies, permissions,
capabilities, migrations, and destructive flags
  ↓ confirm exact SHA-256
backup when migrations are pending
  ↓
versioned staging + transaction(migrations, history, registry) — advisory-locked per plugin id
  ↓
installed → active → inactive → files removed (data preserved)
```

Every lifecycle mutation (install, activate, deactivate, remove) takes a transaction-scoped PostgreSQL advisory lock keyed by plugin id: concurrent requests for the *same* plugin serialize; different plugins never block each other. Each locked transaction has an explicit 30s timeout so a hung migration or filesystem move fails closed instead of holding the lock forever. A crash between staging a file move and committing its registry row is self-healing: the next install attempt detects the orphaned directory and cleans it up rather than getting stuck on "already present." All of this — plus a deliberately-failing migration proving real transactional rollback — is verified live against PostgreSQL, not just mocked (`docs/acceptance/gate-c-plugin-migration-lock-2026-08-28.md`).

The admin UI cannot install a local upload until `POST /plugins/inspect` succeeds. `POST /plugins/install` requires the exact inspected `confirmationSha256`. Repository updates display equivalent signed metadata and verify their bytes again before invoking installation.

Files live at `PLUGIN_DIR/<plugin-id>/<version>`. Active plugins must be deactivated before update or removal. `DELETE /plugins/:id` removes the registry row and executable files but **preserves plugin tables, migration history, settings, and storage** — reinstalling the same plugin id picks up exactly where removal left off, with zero recovery steps, because migrations with a matching checksum are skipped rather than re-run. Permanent data purge is intentionally a separate, not-yet-built operation. The full install/update/disable/remove/reinstall/core-upgrade lifecycle, including this data-preservation guarantee, is certified live against every PostgreSQL version in the supported matrix (`docs/acceptance/gate-c-plugin-lifecycle-certification-2026-08-28.md`).

Installed contents are reverified from disk, and against the core version currently running, before every activation and startup load — a plugin whose `requiresCore` range no longer covers the running core (e.g. after a core upgrade) is rejected at load time, not just at install time, and its data is untouched while blocked.

## Permission model

`api.routes` handlers, navigation entries, and declarative pages each declare a manifest-namespaced `permission` id. `SUPER_ADMIN` satisfies every permission implicitly, the same way it satisfies every core `@Roles()` check. Every other role needs an explicit grant: an admin issues one via `POST /plugins/:id/permission-grants` (role must be one of `ADMIN, SCHOOL_ADMIN, WATTAMAN, WATTAMAN_REPORTER, CLASS_ADMIN, ACCOUNTER, TEACHER, STUDENT, PARENT` — `GRANTABLE_PLUGIN_ROLES` in `plugin-permissions.service.ts`), reusing the same admin-hierarchy inheritance rule core `@Roles()` guards use. Every dispatch attempt — granted, denied, handler success, or handler failure — is written to the core audit log with actor/plugin/action/outcome (`docs/acceptance/gate-c-plugin-permission-audit-2026-08-28.md`).

`GET /plugin-api/my-extensions` is the non-admin discovery surface: any authenticated role gets back only the navigation entries their role is actually granted (the same rule dispatch itself enforces), so the frontend can surface plugin nav to any role, not just `SUPER_ADMIN` (`docs/acceptance/gate-c-plugin-frontend-permissions-notification-quota-2026-08-28.md`).

## SDK 1.0 capabilities

The runtime exposes only declared capabilities, each gated at the exact call site — declaring a capability in the manifest but not the one a specific call needs still throws:

| Capability | `context.*` surface | Notes |
|---|---|---|
| `api.routes` | `routes.register({ method, path, permission, handler })` | Path matching is **exact** (`method:path` string) — no `:id`-style parameters. A route needing a dynamic id takes it through the request body instead. |
| `events.publish` / `events.subscribe` | `events.publish(event, payload)`, `events.subscribe(event, handler)` | Versioned event names; subscriber failures are isolated from each other and from the publisher. |
| `jobs.schedule` | `jobs.register({ id, intervalSeconds, handler })` | 60s minimum interval in production, no overlapping runs, isolated failure records. |
| `settings.read` / `settings.write` | `settings.get(key, fallback)`, `settings.set(key, value)`, `settings.delete(key)` | JSON values scoped by plugin id, 64 KiB limit. |
| `storage.read` / `storage.write` | `storage.readText(name)`, `storage.writeText(name, value)`, `storage.delete(name)`, `storage.list(prefix)` | Atomic text files scoped beneath `PLUGIN_DATA_DIR/<plugin-id>`, traversal-checked, configurable per-file limit. This is a filesystem KV store, not a database — see `database.*` for live SQL. |
| `permissions.register` | `permissions.register([{ id, label, description? }])` | Must be declared in the manifest's `permissions` array. |
| `navigation.register` | `navigation.register([{ id, label, href, permission? }])` | `href` must be namespaced under `/plugins/<plugin-id>/`. |
| `ui.pages` | (declarative `frontendEntry` JSON, no context method) | Rendered by the generic Next.js plugin host; no plugin browser JavaScript is ever injected. |
| `notifications.send` | `notifications.sendEmail(to, subject, text)`, `notifications.sendSms(to, body)`, `notifications.notifyInApp(userId, message, type)` | Calls the same core email/SMS dispatcher and the same shared cross-feature `Notification` inbox table core itself uses. Every send is checked against a per-plugin daily quota (one atomic upsert-increment, default 200/day, `PLUGIN_NOTIFICATION_DAILY_LIMIT`) and audit-logged whether denied, failed, or succeeded — a denied send never reaches the provider (`docs/acceptance/gate-c-plugin-frontend-permissions-notification-quota-2026-08-28.md`). |
| `database.read` / `database.write` | `database.query<T>(sql, params?)`, `database.execute(sql, params?)` | Live, parameterized (never string-interpolated) raw SQL against the plugin's *own* `plugin_<id>_`-prefixed tables only — the same namespace/forbidden-operation guard migrations enforce, applied again at request time. `query` must be a `SELECT`; `execute` must be `INSERT`/`UPDATE`/`DELETE` — schema changes are reserved for reviewed migrations, never available at runtime. **Always use an explicit column list, never `SELECT *`** — a live schema-changing update can otherwise hit Postgres's "cached plan must not change result type" on a pooled connection that hasn't cycled (a real finding from the lifecycle certification). |
| `directory.read` | `directory.resolveAudience({audience,targetRole?,classId?})`, `directory.lookupUsers(ids)`, `directory.lookupClasses(ids)`, `directory.classesForUser(userId, role)` | The only sanctioned way to resolve "who should receive this" or "what's this user's display name/class" without a plugin ever holding a live join into core `User`/`Class`/`Student`/`NotificationPreference`. |
| `realtime.notify` | `realtime.notifyUser(userId, event, payload)` | Emits through the existing `MessagesGateway`, always under a `plugin:<plugin-id>:<event>` Socket.IO event name applied by the runtime itself — a plugin can never spoof a core event name or another plugin's namespace. |

`database.read/write`, `directory.read`, and `realtime.notify` were added after the initial reference-plugin pass, closing a real gap found while moving the announcements plugin's business data out of core: a plugin previously had no way to query its own data at request time (only at one-time migration), no way to resolve recipients without a core-table join, and no real-time hook (`docs/acceptance/gate-c-plugin-database-directory-realtime-capabilities-2026-08-28.md`).

## Plugin migrations

Every SQL file starts with:

```sql
-- wattanam-plugin-migration: <migration-id>
```

SDK v1 accepts exactly one SQL statement per file. Every referenced table must begin with `plugin_<normalized-plugin-id>_` — including a table a migration `REFERENCES`, so a foreign key **within** a plugin's own two tables is fine, but nothing can reference a core or another plugin's table. Transaction control, roles/users, extensions, grants/revokes, `COPY PROGRAM`, anonymous `DO`, and undeclared destructive operations are rejected. The same namespace/forbidden-operation guard (`plugin-sql-guard.ts`) is shared between migration validation and the live `database.read`/`database.write` capability, so both enforce identically.

Before pending migrations, Wattanam runs its native PostgreSQL backup command. Migration SQL, immutable checksum history, and registry changes then commit in one Prisma transaction, inside the same advisory-locked transaction described above. Failure rolls back database changes and removes staged version files. Reusing an applied migration ID with different bytes is rejected — history is immutable; a schema change ships as a new migration id, not an edit to an old one. Roll-forward is preferred; restore uses [backup-and-restore.md](../operations/backup-and-restore.md).

Signed SQL remains trusted publisher code and requires review plus PostgreSQL upgrade/restore testing before release.

## Safe mode

Set `PLUGIN_SAFE_MODE=true` and restart the API to load no plugin code while retaining core login and `/admin/plugins`. Activation is refused, the UI displays safe mode, and failed plugin files can be removed. Return it to `false` only after remediation.

`PLUGIN_DATA_DIR` must be a persistent volume. Docker Compose declares separate `plugins` and `plugin_data` volumes so executable replacement cannot erase plugin-owned files.

## Administrative endpoints

`/plugins/*` requires `SUPER_ADMIN`. `/plugin-api/:pluginId/*` dispatch requires only authentication — the plugin's own permission grants decide the rest.

```text
GET    /plugins
GET    /plugins/runtime-status
POST   /plugins/inspect
POST   /plugins/install
POST   /plugins/:id/activate
POST   /plugins/:id/deactivate
DELETE /plugins/:id
GET    /plugins/:id/permission-grants
POST   /plugins/:id/permission-grants
DELETE /plugins/:id/permission-grants/:permissionId/:role
GET    /plugin-api/extensions        # SUPER_ADMIN-only unfiltered overview
GET    /plugin-api/my-extensions     # any authenticated role, filtered to what they're granted
ALL    /plugin-api/:pluginId/*       # dispatch; permission-gated per route, not by @Roles()
```

## Reference plugin

`plugins/announcements` is both the complete SDK reference implementation *and* the full production announcements feature — not a demo alongside a still-core-owned business feature. It proves manifest validation, deterministic packaging, signature verification, lifecycle/health, permissions, navigation, declarative frontend settings, authenticated routes across all twelve capabilities, scoped settings/storage, a persisted hourly job, event cleanup, namespaced migrations (including an in-namespace foreign key with `ON DELETE CASCADE`), live parameterized SQL, cross-table recipient resolution, real-time push, and multi-channel notification fan-out. Core's `AnnouncementsController` is a thin, Prisma-free proxy into its dispatch — announcements has exactly one authoritative data owner (Gate C2; `docs/acceptance/gate-c-announcements-cutover-2026-08-28.md`).

## Compatibility and freeze policy

**SDK 1.0 is frozen as of 2026-08-28.** Freezing means:

- The twelve capabilities above, their `context.*` method signatures, the manifest schema, and the migration/permission/lifecycle rules will not change within the 1.x line. `plugin-sdk-contract.spec.ts` pins the exact capability list and the `PLUGIN_SDK_VERSION`/`PLUGIN_RUNTIME_VERSION` constants in CI.
- **Additive, backward-compatible extensions are allowed within 1.x**: a new capability string, a new optional manifest field, a new method on an *existing* capability's context object. These require updating the pinning test and this document's capability table and changelog in the same change, but do not require a version bump.
- **Breaking changes are not allowed within 1.x**: removing a capability, changing an existing method's signature or return shape, or tightening a validation rule in a way that could reject an already-published manifest. Any of these requires shipping `PLUGIN_SDK_VERSION`/`PLUGIN_RUNTIME_VERSION` `2.0.0` and a documented migration path; existing 1.x plugins keep working against the 1.x runtime during any overlap window.
- **The commercial/support duration of that overlap window is a Product Owner decision, not an engineering one** — it depends on DEC-011 (plugin trust model), which is still `proposed`. This document commits to the technical freeze and additive/breaking rules above; it does not commit to a specific support-window length, since that requires DEC-011's approval first.

### Changelog

- **1.0.0** (2026-08-28) — Frozen. Final capability set: `api.routes`, `database.read`, `database.write`, `directory.read`, `events.publish`, `events.subscribe`, `jobs.schedule`, `navigation.register`, `notifications.send`, `permissions.register`, `realtime.notify`, `settings.read`, `settings.write`, `storage.read`, `storage.write`, `ui.pages`. Dispatch permission model (grants + audit) and `my-extensions` discovery included from the start of the freeze. `plugins/announcements` is the reference implementation and the sole production consumer.
