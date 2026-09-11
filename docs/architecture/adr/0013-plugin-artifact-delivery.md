# ADR-0013: Plugin Artifact Delivery

Status: **Proposed** — drafted 2026-09-11 for Gate LC-0 (**LC0-006**). Awaiting product-owner approval.

## Context

An installed plugin's code lives on the local filesystem under `PLUGIN_DIR` (`/data/plugins` in production). The lifecycle service, the runtime and the config all read it (`plugins.service.ts:244`, `plugin-runtime.service.ts:211`, `plugin-config.ts:7`), and backups copy it with the database (`backup.service.ts:85`).

The backend can run as separate `api` and `worker` roles (`PROCESS_ROLE`, `config/environment.ts:89-90`), and plugin jobs execute in the worker. Separate Railway services cannot share a volume, so a database row saying a plugin is active does not guarantee the worker holds the same verified code. Under lean core, where every business feature is a plugin, that gap would affect every school.

## Decision (proposed)

1. **Artifacts are immutable and addressed by SHA-256 digest**, stored centrally by the marketplace and the update repository. A release's digest is part of its signed metadata.
2. **Every runtime role keeps its own local, read-only cache.** Each API or worker instance downloads the artifact itself, verifies the signature and digest, and loads only a version that matches the registry.
3. **Activation uses a rollout generation.** A new version becomes active only when every required role reports it ready; until then the previous generation keeps serving. A role that cannot fetch or verify an artifact reports itself unready and does not load it.
4. **Plugin-owned mutable files use S3-compatible storage** in any multi-service deployment. A local volume is supported only in the documented single-runtime topology (`PROCESS_ROLE=combined`, as in Docker Compose).
5. **Entitled versions stay retrievable for the contractual recovery period**, so withdrawing a release never makes a school's own backup unrestorable. The recovery set keeps the artifacts it restores (lean-core plan 12.7). The retention period itself is set with the recovery policy.
6. **Offline package import survives only as a restore path.** DEC-006 says signed package import works offline; lean-core plan section 7 says customers never upload packages. The recommended reconciliation: a school can re-import artifacts from its own recovery set, which are already verified and entitled, but there is no general upload.

## Consequences

- `PLUGIN_DIR` becomes a cache, not the source of truth: losing it costs a download, not an installation.
- The required proof (lean-core plan 12.5): restart, horizontal scaling, API/worker version skew, cache loss and rollback all load the same version.
- A multi-service school must have object storage configured before its first plugin that stores files. That adds a step to managed-hosting provisioning.
- Point 6 narrows DEC-006. It is recorded here so DEC-006's acceptance record can reference it.

## Alternatives considered

- **A shared volume for all roles.** Not available across Railway services.
- **Artifacts stored in the school database.** Every role can already reach it, but backups grow with every release and PostgreSQL becomes a file store.
- **Bake plugins into the school image.** Every install or update would become a redeploy, which defeats marketplace installation.

## Related

[Lean-core plan 12.5, 12.7](../wattanam-lean-core-plugin-first-plan.md) · [Migration plan 6.3](../module-to-plugin-migration-plan.md) · [ADR-0005 storage](./0005-storage.md) · [DEC-006](../../platform-master-execution-plan.md#2-product-and-architectural-decisions)
