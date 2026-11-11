# @wattanam/plugin-sdk

Typed SDK for building Wattanam V2 plugins: the frozen SDK 1.0 contract types, manifest validation, and a local test harness. See [docs/plugins/package-and-runtime.md](../../docs/plugins/package-and-runtime.md) for the full contract this package implements, and [docs/plugins/upgrade-guide.md](../../docs/plugins/upgrade-guide.md) for versioning an existing plugin.

## Install

```bash
npm install --save-dev @wattanam/plugin-sdk
```

## Types

```ts
import type { RuntimePluginModule, PluginRuntimeContext, PluginManifest } from '@wattanam/plugin-sdk';

const plugin: RuntimePluginModule = {
  id: 'acme.widget',
  activate(context: PluginRuntimeContext) {
    context.routes.register({
      method: 'GET', path: 'status', permission: 'acme.widget.read',
      async handler() { return { ok: true }; },
    });
  },
};
export = plugin;
```

Every capability's `context.*` method is typed exactly as the runtime enforces it — see the table in `package-and-runtime.md` for what each one does and which manifest capability gates it.

## Manifest validation

```ts
import { parsePluginManifest, PLUGIN_CAPABILITIES } from '@wattanam/plugin-sdk';

const manifest = parsePluginManifest(JSON.parse(fs.readFileSync('plugin.json', 'utf8')));
// throws a plain Error with the same message the real backend verifier would, on any
// manifest issue -- run this before you ever pack and sign a package.
```

`PLUGIN_CAPABILITIES` is the frozen, complete list of the twelve SDK 1.0 capabilities. It's identical to `backend/src/plugins/plugin-manifest.ts`'s `PLUGIN_CAPABILITIES` by convention (kept in sync via a "twin pinning" test in each repo, not a runtime dependency) — see the freeze policy in `package-and-runtime.md`.

Backend packages may explicitly declare `executionMode` as `in-process` or `isolated`. `in-process` is accepted only for operator allow-listed publishers. `isolated` is a reserved fail-closed declaration until the host has a separately deployed and certified execution runtime. Packages without `backendEntry` use `declarative` mode and execute no plugin JavaScript in the host process. Older manifests remain compatible: the parser derives `in-process` when a backend entry exists and `declarative` otherwise.

## Local test harness

```ts
import { createTestContext } from '@wattanam/plugin-sdk';
import plugin from './backend/index';

test('registers a status route', async () => {
  const harness = createTestContext();
  await plugin.activate(harness.context);

  const route = harness.routes.find((r) => r.path === 'status');
  await expect(route!.handler({ method: 'GET', path: 'status', params: {}, query: {}, body: null, principal: { userId: 'u1', role: 'ADMIN' } }))
    .resolves.toEqual({ ok: true });
});
```

`createTestContext()` returns `{ context, routes, jobs, permissions, navigation, events, notifications, realtime }` — call your plugin's `activate(context)`, then inspect the recorder arrays to assert what it did. `settings`/`storage` are real in-memory stores (round-trip correctly); `database`/`directory` default to empty/no-op responses — pass `overrides` to `createTestContext({ database: { ... } })` to supply your own fixture data for a specific test. Overrides replace a whole sub-object (`database`, `directory`, etc.), not individual methods within it.

This harness never talks to a real database or a running backend — it's for testing your plugin's own logic in isolation. Use `wattanam-plugin check <dir>` (from `@wattanam/plugin-cli`) for full manifest+migration+entry-point validation before packaging.

## Plugin-owned screens (`ui/`)

A plugin can ship its own screens. Put static files under `ui/` in the plugin folder and declare an `app` component in `frontend/page.json`:

```json
{ "id": "sessions-app", "type": "app", "title": "Session Time Settings",
  "options": { "entry": "ui/sessions/index.html", "height": "auto", "minHeight": 400 } }
```

The school core (0.1.29 or newer, so set `"requiresCore": ">=0.1.29 <1.0.0"`) shows the screen in a sandboxed iframe:
- It has no network access and no access to school cookies, storage or the school page.
- It talks to the host through `ui/wattanam-plugin-ui.js`. Copy that file from this package into your plugin's `ui/` folder.

```html
<script src="../wattanam-plugin-ui.js"></script>
<script src="app.js"></script>
```

```js
const host = await WattanamPluginUI.connect();           // { pluginId, pluginVersion, params, language, theme }
const rows = await WattanamPluginUI.api.get('sessions');  // YOUR plugin's API only, as the signed-in user
await WattanamPluginUI.api.put('session-settings', { ... });
WattanamPluginUI.navigate('settings');                    // another page of this plugin
WattanamPluginUI.autoResize();                            // frame follows the content height
```

- **Theme colours:** the host's colours arrive as CSS variables named `--host-primary`, `--host-text` and so on.
- **Scripts:** inline `<script>` blocks are blocked, so put your code in separate `.js` files.
- **Checking before you publish:** `wattanam-plugin check` validates the entry, the file types and inline scripts.

See the Customer School guide `docs/plugin-ui-apps.md` for the full security model.
