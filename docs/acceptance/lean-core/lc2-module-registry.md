# LC2-003 Root Module Registry Evidence

Status: **LC2-003, LC2-004 and LC2-005 accepted**

Date: 2026-09-11

`backend/src/distribution/module-registry.ts` is the typed registry for all local Nest modules
imported directly by `AppModule`. It assigns exactly one classification and future owner to each:

| Classification | Count | Meaning |
|---|---:|---|
| Core | 13 | Permanent platform foundation |
| Shared | 2 | Core-owned capabilities intentionally exposed to plugins |
| Proxy | 1 | Announcements compatibility route surface after extraction |
| Business | 21 | Current compiled business modules that move to accepted plugin owners |
| **Total** | **37** | Every local root import |

Framework dynamic modules (`ThrottlerModule` and `ScheduleModule`) are not local feature modules and
therefore are not entries. Mixed roots retain explicit `split:` ownership instead of being silently
assigned to one plugin.

## LC2-004 — Backend composition

`AppModule` is now a dynamic root. Both API and worker read validated runtime configuration first
and bootstrap `AppModule.register(config.distribution)`. The root resolves actual Nest module types
from the registry-selected names:

- `core` imports the 13 core and 2 shared local roots; it imports no compatibility proxy or business
  root;
- `legacy-full` imports all 37 local roots and therefore preserves the existing application;
- framework rate limiting and scheduling remain root infrastructure in both profiles.

Static TypeScript imports still load module definitions into the bundle, but Nest receives only the
selected classes in its dynamic-module `imports`; excluded business modules are not instantiated and
their controllers/providers are not registered. Removing their compiled code from the distribution
artifact is a later packaging concern, not part of this composition gate.

## Acceptance verification

- The registry test parses `app.module.ts` and requires exact equality with every local `.module`
  import, so additions, removals, duplicates and path drift fail CI.
- The test permits only `core`, `shared`, `proxy`, and `business` and asserts no business entry is
  owned by lean core.
- The composition test compares the actual class names returned for both profiles with the registry,
  asserts 15 core/shared roots versus all 37 legacy roots, and specifically excludes Attendance and
  the Announcements proxy from core.
- `main.ts` and `worker.ts` both pass the validated profile into the dynamic root.
- Backend build and focused tests must pass before handoff.

Verification on 2026-09-11: 4/4 focused tests passed and 244 backend files compiled successfully.

## LC2-005 — Worker runtime boundary

The worker bootstraps the same `AppModule.register(config.distribution)` boundary as the API. Its
schedule framework remains enabled for the worker role, but only providers from selected modules
can register handlers. The contract test independently scans real source decorators, resolves their
owning root through the registry, and currently reconciles:

- seven scheduled handlers, all in core/shared infrastructure (audit cleanup, backup, marketplace
  entitlement/billing synchronization and core digest composition);
- three gateways, all in excluded business roots (Attendance, Transportation and Communication/
  Parent Portal);
- zero business runtime items whose owning root is selected by the core profile.

This test fails if a new runtime decorator is placed under an unclassifiable root or if a business
root becomes part of core composition. Plugin runtime jobs registered dynamically remain owned by
the core plugin host and are governed separately by activation and entitlement state.
