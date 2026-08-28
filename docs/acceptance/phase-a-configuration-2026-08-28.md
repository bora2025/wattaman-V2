# Phase A Configuration Validation Evidence — 2026-08-28

Scope: incremental A-008/FND-001 evidence. This does not close A-008 because provider credential custody, rotation, and automated redaction tests remain.

Verified behavior:

- Required database, production JWT, and exact CORS configuration fails before the server listens.
- Ports, refresh-token lifetime, backup retention, plugin package/unpacked sizes, and per-file plugin storage sizes are integer-bounded.
- Cookie and plugin safe-mode flags accept only explicit `true` or `false` values.
- Access-token expiry accepts an explicit duration syntax.
- Backup, installed-plugin, and plugin-data paths must be absolute in production.
- Safe development/test defaults remain available.

Commands and results:

```text
cd backend
npm.cmd test -- --runInBand
19 suites passed; 65 tests passed

npm.cmd run build
Successfully compiled 152 files with SWC
```

The earlier transient Windows `EPERM` occurred while a previous build still held the generated `dist` directory. A clean retry succeeded without changing or deleting source files.
