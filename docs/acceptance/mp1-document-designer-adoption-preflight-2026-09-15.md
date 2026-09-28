# Document Designer adoption preflight

Status: read-only preflight implemented; adoption and cutover not certified.
Date: 2026-09-15

Run from `backend/` with a school database connection:

```powershell
npm.cmd run db:document-designer:preflight
```

The command reads `CardTemplate` in ID-ordered chunks and checks that the signed plugin's
namespaced target table exists. It emits source row/type counts, active-template IDs, design
byte estimate, deterministic SHA-256 fingerprint and blockers. It also inventories embedded
PNG/JPEG/WebP logo payloads by SHA-256, deduplicates repeated references, reports their bounded
byte total, and blocks remote URLs, malformed base64, unsupported MIME types, and assets over the
one-MiB per-file limit. It does not emit design JSON or asset bytes,
write database rows, create a backup/journal, grant permissions or change routing. Exit code 2
means not ready; exit code 1 means the read failed.

Verification on 2026-09-28:
`node --test scripts/document-designer-adoption-preflight.test.js scripts/document-designer-adopt.test.js scripts/document-designer-rollback-drill.test.js`
passed 12/12.
Fixtures cover deterministic chunking, zero mutation calls, duplicate active designs,
unsupported/mismatched types, absent target, invalid batch size, unordered input, content-hash
deduplication, and fail-closed non-portable asset handling.

The separate guarded `db:document-designer:adopt` command now requires the preflight fingerprint,
an exact school slug confirmation and a school-bound backup manifest/checksum. Its journaled,
idempotent copy compares source and target IDs, JSON designs, active markers and timestamps.
`db:document-designer:dry-run` validates the same backup, source fingerprint and empty target,
lists the mutation plan, and creates no journal/lock or database write. The implementation does
not change legacy routes or delete source rows. Portable embedded assets remain within the
byte-reconciled legacy design during the rollback window; conversion into independently stored
schema-v2 assets is deliberately separate so the compatibility copy stays reversible. Local
dry-run, crash/retry, stale-fingerprint,
backup-corruption and target-tamper tests pass (5/5); no live school adoption has been run.

The separate `db:document-designer:convert-assets` command requires the same confirmed school,
source fingerprint, verified backup and reconciled adoption journal. It copies each unique image
once into plugin-scoped storage using a deterministic content-derived UUID, annotates only the
plugin-owned design with `assetId`/`originalAssetId`, preserves legacy data URIs, and fails on an
optimistic concurrency conflict. Four focused conversion tests pass locally. The required restored
PostgreSQL rehearsal invokes this exact conversion, but its first enhanced live/CI run is pending.

After exact reconciliation, adoption idempotently grants `view` to every authenticated legacy
school role so active designs remain readable. `edit`, `generate` and `print` are granted to
`ADMIN` (and inherited by higher administrative roles). The grant matrix is stored in the
backup-bound journal. Full generate/print row-scope certification remains open.

Before cutover, prove a real recovery backup can be restored, compare rendered output,
preserve grants, certify rollback, and run a controlled pilot. A compatibility adapter now keeps
`/card-templates` on legacy ownership by default and maps all existing operations to plugin routes
only when `DOCUMENT_DESIGNER_ROUTE_OWNER=plugin`. Returning it to `legacy` is the non-destructive
routing rollback; neither dataset is deleted. Three controller tests cover invalid configuration,
default legacy ownership and explicit plugin mapping. Live cutover/rollback is not yet certified.
This local implementation alone does not close MP1-004.
