# Changelog

## 1.0.0 (2026-08-28)

Initial release, matching the SDK 1.0 freeze (C-006). Ships:

- `PluginManifest` type and `parsePluginManifest()`, matching `backend/src/plugins/plugin-manifest.ts`'s validation rules exactly.
- `PLUGIN_CAPABILITIES` (the frozen 12-entry list), `PLUGIN_SDK_VERSION`, `PLUGIN_RUNTIME_VERSION`.
- `PluginRuntimeContext` and every supporting type (`PluginRouteRequest`, `RuntimePluginModule`, `DirectoryAudienceQuery`, `DirectoryRecipient`, etc.).
- `createTestContext()`, a local, backend-free test harness.
