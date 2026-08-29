# ADR-0005: File Storage

Status: **Proposed** — implemented as the Version 1 default; formal acceptance is blocked on **DEC-010** at Gate **B0**.

## Context

The platform stores several classes of files that are not database rows: plugin packages, per-plugin scoped storage (`storage.read/write` capability), marketplace release artifacts, and (eventually) user-uploaded content. These need a storage interface, not just a filesystem path hard-coded everywhere, so the backing store can change without touching every call site.

## Decision

**Persistent local/Railway volumes first; a reversible S3-compatible adapter after a file inventory, not before.**

- Today, every persistent file class lives on a persistent volume: `/data/backups`, `/data/plugins`, `/data/plugin-data/<id>` on the school side; `/data/artifacts` on the marketplace side ([technical-inventory.md](../technical-inventory.md)). These are configured via `PLUGIN_DIR`, `PLUGIN_DATA_DIR`, `ARTIFACT_STORAGE_PATH`, bounded by `PLUGIN_MAX_PACKAGE_BYTES`/`PLUGIN_MAX_UNPACKED_BYTES`/`PLUGIN_STORAGE_MAX_FILE_BYTES`/`MAX_ARTIFACT_BYTES`.
- The plugin `storage.read/write` capability already gives plugin authors a storage **interface** (not a raw filesystem path) scoped to the plugin's own namespace — the abstraction this ADR requires already exists at the plugin-facing edge; what's still open is only the *backing implementation* migrating from local volume to S3-compatible object storage (**B-015**, not yet built).
- Marketplace artifacts are **immutable by digest** once published (`/data/artifacts`), replicated before production release, and restore-drilled (`D-001`) — this immutability property must be preserved by any future S3 adapter, not just the interface shape.
- A reversible **dual-write cutover** (write to both backends, verify checksums match, then cut reads over, matching the "Integrity/checksum comparison, dual-write cutover test, rollback, backup/restore" acceptance bar B-015 already specifies) is the required migration path — not a one-way "switch the env var" cutover.

## Consequences

- Every current backup/restore drill (OPS-003, D-001, B-012) is scoped to volume-backed storage; introducing S3 requires re-running each of those drills against the new backend before B-015 can be considered done, not just proving the write path works.
- Self-hosted (Compose) operators are not required to adopt S3 — local volumes remain a first-class, permanently supported backend, not a migration path everyone must eventually take. S3 is additive for schools/operators that want off-box durability, not a replacement requirement.
- Until B-015 lands, a Railway volume outage or a Compose host disk failure is a single point of failure for plugin files/artifacts on that installation — mitigated today only by the existing backup/restore cadence (B-008), not by storage redundancy.

## Alternatives considered

- **S3-compatible storage from day one**: rejected for Version 1 — it adds a network dependency and a new credential class (see [secrets-inventory.md](../../operations/secrets-inventory.md)) to every installation before the actual file-size/growth profile of real schools is known; the plan explicitly sequences "S3-compatible adapter **after** file inventory," not before.
- **A single shared object-storage bucket across all schools**: rejected outright — it would violate [ADR-0002](./0002-tenancy.md)'s per-school isolation boundary the same way a shared database would.

## Related

[DEC-010](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [technical-inventory.md](../technical-inventory.md) · [secrets-inventory.md](../../operations/secrets-inventory.md) · B-012/B-015 (still open)
