# ADR-0017: Compatibility Windows

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-010**.

## Context

What the code enforces today:

- **Core** reads `APP_VERSION` and refuses update checks unless it is semantic (`updates.service.ts:21-22`). The repository is at 0.1.0.
- **Plugins** declare `requiresCore`, `sdkVersion` and `runtimeVersion`. Installation checks `requiresCore` against the running core (`plugin-package.ts:84`), and the other two against `PLUGIN_SDK_VERSION` 1.0.0 and the runtime version (`plugin-manifest.ts:22, 141-142`). The announcements plugin requires `>=0.1.0-0 <1.0.0`.
- **Node**: the backend, marketplace API and platform admin images build on `node:20`, the frontend image on `node:24` (`frontend/Dockerfile:1`), and CI runs Node 20 for everything. **Node 20 reached end-of-life on 2026-04-30** and no longer receives security fixes.
- **PostgreSQL** 16, in Compose (`docker-compose.yml:5`) and CI.
- **Frontend**: Next 16.3 with React 19.2. **Backend**: NestJS 11 with Prisma 5.22.
- **Mobile**: Expo SDK 55 and React Native 0.83, app version 1.0.0. No minimum-app-version check was found.

What is missing is a stated policy: how long each version stays supported, and what a school, a plugin or an app can rely on.

## Decision

1. **Core.**
   - Core uses semantic versioning. It stays 0.x until the release that makes lean core the installation default (LC-7), which becomes 1.0.0. From then on, a breaking change to anything plugins use needs a new major.
   - Wattanam supports the latest two core minors. A school further behind is asked to update before it can install new plugins.
2. **SDK and runtime.** Core supports the current and the previous SDK major, and a major stays supported for at least 12 months after its successor ships. A deprecation is announced one minor release ahead and shows as a warning in the affected plugin's health.
3. **Plugins.** Every release declares `requiresCore`, `sdkVersion` and `runtimeVersion`, as is already enforced. The marketplace offers a school only releases compatible with its core, and an official plugin supports every core release inside the core window.
4. **Node.**
   - Every service and CI job runs one Node LTS line, currently Node 24; plugins run on the core's line.
   - Wattanam moves to a new LTS line within six months of it entering active LTS, and never runs a line past end-of-life.
   - The Node 20 images and CI jobs therefore move to Node 24 now.
5. **PostgreSQL.** 16 is supported. A new major is certified with all migrations and a restore drill before it is offered, and both majors are supported during the transition.
6. **Browsers.** The latest two major versions of Chrome, Edge, Firefox and Samsung Internet, plus the current and previous major of Safari on macOS and iOS. This needs checking against the devices schools actually use; with no telemetry yet (DEC-012), there is no data.
7. **Mobile.**
   - The current and previous store releases are supported. Below a minimum app version, which the server enforces, the app shows an update screen.
   - The app declares which UI schema version it renders ([ADR-0011](./0011-plugin-ui-declarative-v2.md)), and plugin screens are offered only to apps that can draw them.
8. **Cutover windows.** Legacy URLs and compatibility proxies stay for at least one core release and 90 days after a feature's cutover (the rollback window). Event versions follow the SDK window ([ADR-0015](./0015-cross-plugin-event-consistency.md)).

## Consequences

- Point 4 is overdue whatever LC-0 decides: a service on an end-of-life runtime gets no Node security fixes.
- Supporting two SDK majors means core carries adapters for the previous one; the 12 months in point 2 bound that cost.
- Point 6 constrains the UI v2 component library: nothing it renders may need a browser newer than the window.

## Alternatives considered

- **Only the latest of everything.** Cheapest for Wattanam, but self-hosted schools (DEC-008) and older school phones would break on every release.
- **Long-term-support core releases** (say, 24 months each). Friendlier to cautious schools, but with managed hosting Wattanam controls most updates, and every supported line multiplies the plugin test matrix.

## Related

[Lean-core plan 12.12](../wattanam-lean-core-plugin-first-plan.md) · [package-and-runtime.md](../../plugins/package-and-runtime.md) · [DEC-008, DEC-012](../../platform-master-execution-plan.md#2-product-and-architectural-decisions)
