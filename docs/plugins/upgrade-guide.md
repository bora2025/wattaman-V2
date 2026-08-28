# Plugin Upgrade Guide

How to version-bump an existing plugin, using only the public tooling (`@wattanam/plugin-sdk`, `wattanam-plugin`). See [package-and-runtime.md](./package-and-runtime.md) for the full SDK 1.0 contract and [security-review-checklist.md](./security-review-checklist.md) before publishing.

## The rule that matters most: migration history is immutable

Once a migration id has been applied anywhere, its SQL can never change. `PluginMigrationsService.apply()` rejects a reused migration id whose bytes don't match what's already recorded — this is deliberate (`docs/plugins/package-and-runtime.md`'s "Plugin migrations" section), not a bug to work around. If you need to change a table's shape, **add a new migration file with a new id**; never edit an old one, even if it hasn't shipped to a real installation yet (you can't know that from the tooling's side).

## Steps

1. **Bump `plugin.json`'s `version`** to the next semantic version. Decide the bump like any other semver-versioned software: patch for a bug fix with no contract change, minor for a backward-compatible addition (a new route, a new optional field your own routes read), major for anything that could break an existing installation of this plugin (a route's response shape changes, a setting's meaning changes).

2. **Add a new migration file for any schema change** — never edit an existing one. Follow the naming convention already in your `migrations/` directory (`00N_description.sql`), and the same rules as any migration: one statement, `plugin_<publisher>_<name>_`-namespaced tables only, `destructive: true` declared for `DROP`/`TRUNCATE`/`ALTER ... DROP`. Add the new entry (id, path, checksum, destructive) to `plugin.json`'s `migrations` array — keep every previous entry exactly as it was.

3. **Run `wattanam-plugin check <dir>`** before doing anything else. It validates the new manifest, confirms every migration file's checksum matches what's declared (including the ones you didn't touch — a good way to catch an accidental edit to old SQL), and smoke-tests `activate()` against the local harness.

4. **Update `CHANGELOG.md`** with what changed and why — this is what a school admin (or a reviewer, per the security checklist) reads before deciding whether to accept the update.

5. **Pack and sign** with the same publisher key as before (a version bump does not rotate keys):
   ```bash
   wattanam-plugin pack --source . --private-key <path> --key-id <id> --out ./dist/<publisher>-<name>-<version>.wtp
   ```

6. **Test the update path locally before publishing.** Install the *previous* version into a disposable backend, activate it, deactivate it, then install the new `.wtp` as an update (the same plugin id, a higher version) and reactivate — confirm your own data survives, the same way the platform's own certification does (`docs/acceptance/gate-c-plugin-lifecycle-certification-2026-08-28.md`). An update only proceeds while the plugin is inactive; deactivate first.

7. **Publish**: `wattanam-plugin publish --package ... --repository-url ... --admin-token ... --channel beta --changelog "..."`. Publish to `beta` first for anything non-trivial; promote to `stable` only after it's been run for real. (Publishing today goes through the official-repository admin endpoint — see `package-and-runtime.md`'s trust model. Open, self-service publisher submission is a separate, not-yet-open capability.)

## What an update cannot do

- It cannot rename the plugin id — that's a new plugin, not an update.
- It cannot drop a migration that's already shipped, even a broken one — ship a corrective migration instead.
- It cannot change `requiresCore` to a range that would make already-installed copies suddenly report incompatible on their *next* activation without a real core upgrade happening — the compatibility check re-runs on every load, not just at install time (verified in the lifecycle certification), so narrowing this range has an immediate, real effect on any installation whose core version falls outside the new range.
