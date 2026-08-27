# Signed Plugin Package and Runtime

## Trust model

Wattanam plugins are trusted in-process server code. Capability declarations define the supported SDK and review surface; they are not an operating-system sandbox. Only packages signed by explicitly trusted publisher keys may be installed. The API container therefore runs as a non-root user, private signing keys stay outside installations and Git, and third-party publishing remains closed until governance and review are operational.

Plugins do not receive Nest's container, Prisma, database credentials, or unrestricted filesystem paths through SDK v1.

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

Generate an external signing pair and build deterministically:

```bash
cd backend
npm run plugin:keygen -- /secure/signing/wattanam-2026
npm run plugin:pack -- \
  --source ../plugins/announcements \
  --private-key /secure/signing/wattanam-2026/plugin-signing-private.pem \
  --key-id official-2026 \
  --out ../artifacts/wattanam-announcements-0.1.0.wtp
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
  "capabilities": ["api.routes", "settings.read", "ui.pages"],
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
versioned staging + transaction(migrations, history, registry)
  ↓
installed → active → inactive → files removed
```

The admin UI cannot install a local upload until `POST /plugins/inspect` succeeds. `POST /plugins/install` requires the exact inspected `confirmationSha256`. Repository updates display equivalent signed metadata and verify their bytes again before invoking installation.

Files live at `PLUGIN_DIR/<plugin-id>/<version>`. Active plugins must be deactivated before update or removal. `DELETE /plugins/:id` removes registry/executable files but preserves plugin tables, migration history, settings, and storage. Permanent data purge is intentionally a separate future operation.

Installed contents are reverified from disk before every activation and startup load. Failed activation unregisters partial extensions and marks the plugin failed without preventing core startup.

## SDK v1 services

The runtime exposes only declared capabilities:

- Versioned event publish/subscribe with subscriber failure isolation.
- Namespaced routes below `/plugin-api/<plugin-id>/`; v1 limits these to authenticated `SUPER_ADMIN` users while granular platform policy work continues.
- Persisted job definitions and run results, a 60-second minimum production interval, no overlapping run, and isolated failure records.
- JSON settings scoped by plugin ID, validated keys, and a 64 KiB value limit.
- Atomic text storage scoped beneath `PLUGIN_DATA_DIR/<plugin-id>`, traversal checks, and a configurable per-file limit.
- Manifest-declared permissions and navigation.
- Declarative `json-settings` pages rendered by the generic Next.js plugin host; package browser JavaScript is not injected.
- Lifecycle cleanup and optional health checks.

## Plugin migrations

Every SQL file starts with:

```sql
-- wattanam-plugin-migration: <migration-id>
```

SDK v1 accepts exactly one SQL statement per file. Every referenced table must begin with `plugin_<normalized-plugin-id>_`. Transaction control, roles/users, extensions, grants/revokes, `COPY PROGRAM`, anonymous `DO`, and undeclared destructive operations are rejected.

Before pending migrations, Wattanam runs its native PostgreSQL backup command. Migration SQL, immutable checksum history, and registry changes then commit in one Prisma transaction. Failure rolls back database changes and removes staged version files. Reusing an applied migration ID with different bytes is rejected. Roll-forward is preferred; restore uses [backup-and-restore.md](../operations/backup-and-restore.md).

Signed SQL remains trusted publisher code and requires review plus PostgreSQL upgrade/restore testing before release.

## Safe mode

Set `PLUGIN_SAFE_MODE=true` and restart the API to load no plugin code while retaining core login and `/admin/plugins`. Activation is refused, the UI displays safe mode, and failed plugin files can be removed. Return it to `false` only after remediation.

`PLUGIN_DATA_DIR` must be a persistent volume. Docker Compose declares separate `plugins` and `plugin_data` volumes so executable replacement cannot erase plugin-owned files.

## Administrative endpoints

All require `SUPER_ADMIN`:

```text
GET    /plugins
GET    /plugins/runtime-status
POST   /plugins/inspect
POST   /plugins/install
POST   /plugins/:id/activate
POST   /plugins/:id/deactivate
DELETE /plugins/:id
GET    /plugin-api/extensions
ALL    /plugin-api/:pluginId/*
```

## Reference plugin

`plugins/announcements` proves manifest validation, deterministic packaging, signature verification, lifecycle/health, permissions, navigation, declarative frontend settings, authenticated GET/PATCH routes, scoped settings/storage, a persisted hourly job, event cleanup, and a non-destructive namespaced migration. Its contract suite invokes each extension, and its complete source is packed and reverified in automated tests.

Existing announcement records and user workflows remain in core until a PostgreSQL cutover test proves migration of customer data without loss. The package is the complete SDK reference; it does not falsely claim that legacy production data has already moved.
