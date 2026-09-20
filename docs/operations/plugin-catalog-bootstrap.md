# Plugin Catalog Bootstrap

This runbook populates the marketplace catalog so plugins appear in Platform Admin and customer-school plugin pages.

## Preconditions

- Marketplace API is deployed and reachable at `MARKETPLACE_URL`.
- You have a valid `MARKETPLACE_ADMIN_TOKEN`.
- Publisher exists in marketplace (`/admin/v1/publishers`).
- Plugin signing private key exists locally.

## Recommended setup (one time)

Create `.env.marketplace.local` at repository root (copy from `.env.marketplace.local.example`) and fill the real values:

```text
MARKETPLACE_URL=https://marketplace-api-production-f821.up.railway.app
MARKETPLACE_ADMIN_TOKEN=<real-token>
PLUGIN_SIGNING_PRIVATE_KEY=C:/secure/wattanam-publisher/plugin-signing-private.pem
PLUGIN_SIGNING_KEY_ID=official-plugin-2026
```

All marketplace scripts in `tools/` auto-load this file, so values persist across new terminal windows.

## 1. Pack plugin artifacts

From repository root:

```bash
cd backend
npm run plugin:pack -- --source ../plugins/announcements --private-key /secure/wattanam-publisher/plugin-signing-private.pem --key-id official-plugin-2026 --out ../tmp/plugin-packages/wattanam.announcements-1.0.0.wtp
npm run plugin:pack -- --source ../plugins/wattanam.document-designer --private-key /secure/wattanam-publisher/plugin-signing-private.pem --key-id official-plugin-2026 --out ../tmp/plugin-packages/wattanam.document-designer-0.1.0.wtp
```

## 2. Publish all packed artifacts

From repository root:

```bash
MARKETPLACE_URL=https://marketplace-api-production-f821.up.railway.app \
MARKETPLACE_ADMIN_TOKEN=<redacted> \
PLUGIN_PACKAGES_DIR=./tmp/plugin-packages \
CHANNEL=STABLE \
PAID=false \
CHANGELOG="Initial production bootstrap" \
npm run marketplace:publish:packages
```

## Optional: one-shot pack and publish

Use this to discover plugins under `./plugins`, build `.wtp` files, then publish them in one command.

```powershell
$env:MARKETPLACE_URL = "https://marketplace-api-production-f821.up.railway.app"
$env:MARKETPLACE_ADMIN_TOKEN = "<redacted>"
$env:PLUGIN_SIGNING_PRIVATE_KEY = "C:/secure/wattanam-publisher/plugin-signing-private.pem"
$env:PLUGIN_SIGNING_KEY_ID = "official-plugin-2026"
$env:CHANNEL = "STABLE"
$env:PAID = "false"
$env:CHANGELOG = "Initial production bootstrap"
npm run marketplace:pack-and-publish
```

With `.env.marketplace.local` configured, you can run it directly with no extra env commands:

```powershell
npm run marketplace:check-publish-env
npm run marketplace:bootstrap:catalog
```

Optional override for a subset:

```powershell
$env:PLUGIN_SOURCES = "plugins/announcements,plugins/wattanam.document-designer"
npm run marketplace:pack-and-publish
```

Windows PowerShell form:

```powershell
$env:MARKETPLACE_URL = "https://marketplace-api-production-f821.up.railway.app"
$env:MARKETPLACE_ADMIN_TOKEN = "<redacted>"
$env:PLUGIN_PACKAGES_DIR = "./tmp/plugin-packages"
$env:CHANNEL = "STABLE"
$env:PAID = "false"
$env:CHANGELOG = "Initial production bootstrap"
npm run marketplace:publish:packages
```

## 3. Verify catalog is no longer empty

```bash
curl --fail-with-body "$MARKETPLACE_URL/v1/catalog"
```

Expected result: non-empty `items` list.

## 4. Verify UI

- Platform Admin plugins page should list plugins.
- Customer school plugins page requires school marketplace link status `linked` before catalog fetch.

## Notes

- This script publishes already-built `.wtp` files only; it does not generate keys or package files.
- If a package was already published with the same immutable artifact/version, API may reject duplicates by design.
