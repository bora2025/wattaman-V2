# Changelog

## Unreleased

- Test harness enforces the school host job rules (id format; interval 60..31536000 seconds), so `wattanam-plugin check` and certification catch a job that would stop the plugin from activating in a school.

- `ui/wattanam-plugin-ui.js`: client for plugin-owned screens (`app` component, school core 0.1.29+): bridge to the plugin's own API, navigation, theme variables and auto-resize.

## 1.3.0 — 2026-10-20

- Added the backward-compatible `executionMode` manifest declaration. Third-party isolated execution remains fail closed until a separate runtime is configured and certified.

## 1.1.0 — 2026-09-14

- Added durable transactional events, versioned read models, optional dependency availability,
  and versioned route request/response/error contracts without changing the frozen 1.0 capability set.

## 1.0.0 (2026-08-28)

Initial release, matching the SDK 1.0 freeze (C-006). Ships:

- `PluginManifest` type and `parsePluginManifest()`, matching `backend/src/plugins/plugin-manifest.ts`'s validation rules exactly.
- `PLUGIN_CAPABILITIES` (the frozen 12-entry list), `PLUGIN_SDK_VERSION`, `PLUGIN_RUNTIME_VERSION`.
- `PluginRuntimeContext` and every supporting type (`PluginRouteRequest`, `RuntimePluginModule`, `DirectoryAudienceQuery`, `DirectoryRecipient`, etc.).
- `createTestContext()`, a local, backend-free test harness.
