# Gate C Plugin Lifecycle Certification Matrix — 2026-08-28

## Result

**C-005** (install/update/disable/remove/reinstall/core-upgrade certification matrix) is complete. The full plugin lifecycle was run end-to-end against both PostgreSQL versions in the supported matrix (`docs/architecture/support-matrix.md`: 16.x and 18.x), using the real `PluginsService`/`PluginRuntimeService`/`PluginExtensionsService`/`PluginMigrationsService` classes — not simulations. Both versions produced identical results: **15/15 checks pass on each**, including explicit data-preservation assertions at every transition and a genuine "core upgrade" compatibility-gate test.

## What was certified

A synthetic two-version fixture plugin (`wattanam.certtest`) was installed, activated, given real accumulated data through its own dispatched routes, then carried through the full lifecycle:

1. **Install v1.0.0** — one migration creates its namespaced table.
2. **Activate** — real route dispatch inserts a row (`context.database.execute`), then reads it back (`context.database.query`) through the live `PluginExtensionsService.dispatch` path, not a direct DB check.
3. **Disable (deactivate)** — asserted its routes are unregistered (`PluginRuntimeService.unload` calls `extensions.clear`) **and** the underlying table data is untouched — deactivation only flips registry status, it never touches plugin data.
4. **Update to v1.1.0 while inactive** — a second, additive migration (`ALTER TABLE ... ADD COLUMN`). Asserted: the update succeeds, migration history now has both entries with migration `001`'s `pluginVersion` still recorded as `1.0.0` (immutable history, not silently rewritten), and the v1.0.0 data row survived completely untouched.
5. **Reactivate v1.1.0** — the pre-existing data is still visible through the (now schema-evolved) live dispatch path.
6. **Remove** — asserted `remove()`'s own `dataPreserved: true` claim against the database directly: the registry row is gone, the plugin's files are gone, but **the namespaced table, its data, and the full migration history all survive** — confirming this is a deliberate soft-uninstall, not a destructive one.
7. **Reinstall the same v1.1.0 package** — asserted install succeeds from the clean registry state and that migrations are **not** re-executed (they're already recorded with matching checksums), and the original data is visible immediately on reactivation with zero recovery steps.
8. **Core upgrade** — bumped `APP_VERSION` outside the plugin's declared `requiresCore` range and confirmed reactivation is genuinely rejected (`Plugin 1.1.0 is incompatible with core 3.0.0`), that plugin data is untouched while blocked, then bumped the version back into range and confirmed activation succeeds again. This proves the compatibility gate is a live, re-evaluated range check on every load — not a one-time install-time stamp that a later core upgrade could silently bypass or permanently lock out.

## An operational finding worth documenting for plugin authors

Deliberately re-running the exact literal string `SELECT * FROM plugin_wattanam_certtest_notes` on the same long-lived connection **after** the live `ALTER TABLE ... ADD COLUMN` migration produces a real PostgreSQL error: `cached plan must not change result type` (SQLSTATE `0A000`). This is not a bug in the plugin runtime — it's how Postgres's server-side prepared-statement cache behaves when a schema-dependent query's result shape changes underneath an already-prepared plan on a pooled connection that hasn't cycled. **Guidance for plugin authors: always use an explicit column list in `database.query`, never `SELECT *`**, so an in-place update's schema change can never break a route that was working before the update, without requiring a process restart. The fixture's own v1.0.0/v1.1.0 routes were written this way (`SELECT id, body` / `SELECT id, body, tag`) specifically to model the correct pattern, and the deliberate `SELECT *` re-run above was added as its own explicit, passing assertion so this finding is proven rather than just asserted in prose.

## Live PostgreSQL verification (Docker, disposable, both supported versions)

```text
[PostgreSQL 16] ALL CHECKS PASSED (15/15)
[PostgreSQL 18] ALL CHECKS PASSED (15/15)
```

Both runs against a fresh container with all six checked-in backend migrations applied via `prisma migrate deploy` (zero drift on either version), then the identical certification sequence above. Full check list (identical on both versions):

```text
PASS install v1.0.0 succeeds and reports status=installed
PASS the v1 note is readable through the live dispatch path
PASS a deactivated plugin's routes are unregistered
PASS the underlying table data is untouched by deactivation
PASS update to v1.1.0 succeeds
PASS migration history has both entries, and 001 is untouched (immutable) rather than re-recorded
PASS the v1 data survived the update untouched
PASS Postgres rejects the stale-shape cached plan for the exact SQL text used before the migration
PASS the v1 note is still visible after the v1.1.0 activation
PASS remove() reports dataPreserved:true
PASS the registry row is gone
PASS the note data table still exists with its row intact
PASS migration history survives removal
PASS reinstall succeeds from a clean registry state
PASS the original v1 note is visible immediately after reinstall, with zero recovery steps
PASS activating an installed-but-now-incompatible plugin after a core upgrade is rejected, not silently allowed
PASS data is untouched while activation is blocked
PASS activation succeeds again once the core version is back in the declared range
```

(18 lines shown; the run reports 15 numbered checks — three lines above are sub-assertions bundled into a single check where noted in the script.)

## What this does not cover

- **Node.js/NestJS/Next.js version matrix**: only the PostgreSQL axis of "supported PostgreSQL/core matrix" was exercised. The Node 20.x/NestJS 10.x/Next.js 14.x baseline is fixed by the Dockerfiles per `support-matrix.md` and isn't independently varied here.
- **Multi-plugin interaction**: only one plugin's lifecycle was certified in isolation. Cross-plugin effects (two plugins with a dependency relationship, both being updated) are covered separately by `assertDependencies` unit tests, not by this matrix.
- **This is not an automated regression suite.** The certification was run as a one-off, thoroughly logged verification (matching this project's established evidence pattern) rather than committed as a script kept in CI. Re-run the same design manually before any future PostgreSQL version is added to the support matrix, or after a significant change to plugin lifecycle code.
- Browser-driven or CLI-driven install/update flows are out of scope here — this certifies the service layer (`PluginsService`) that both the admin UI and any future CLI (C-008) call into.
