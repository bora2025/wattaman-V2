# Data model

`plugin_wattanam_document_designer_template` belongs exclusively to this plugin. It contains
`id`, `name`, `documentType`, a JSON `design`, `isActive`, and timestamps. A generated nullable
`activeDocumentType` column with a unique constraint allows at most one active template per type
in the single-statement plugin migration format.

Legacy `CardTemplate` uses `cardType` and a `__active__` sentinel name. Adoption must map the
sentinel to `isActive`, preserve IDs and designs, reconcile rows and rendered output, and retain
the source table for rollback. The separate guarded adoption tool performs that copy only after a
school-bound backup and source fingerprint are verified. Its read-only preflight inventories every
embedded PNG/JPEG/WebP logo by content hash, deduplicates references, and blocks remote, malformed,
unsupported, or over-quota asset payloads before any write. Portable embedded bytes remain inside
the byte-reconciled legacy design during the rollback window; moving them into scoped asset storage
is a later schema-v2 conversion and must not mutate the legacy-compatible copy.

After exact adoption reconciliation, `db:document-designer:convert-assets` may copy those embedded
bytes into `wattanam.document-designer/assets/` using deterministic content-derived UUIDs. It adds
`assetId`/`originalAssetId` annotations only to the plugin-owned design, retains `src` and
`originalSrc`, performs optimistic row-concurrency checks, and never mutates `CardTemplate`.

Assets use host-provided scoped plugin storage under generated `assets/<uuid>` keys. Metadata is
stored separately from canonical-base64 binary content; host per-file and total quotas apply.
Accepted content is restricted to common raster images and WOFF/WOFF2 fonts. Legacy embedded-asset
inventory, byte reconciliation, and additive scoped-storage conversion are implemented; hosted
output parity remains part of the cutover gate. No person records or other plugin tables are
joined here.

The schema-v2 compatibility projection preserves page background/frame, bounded element geometry,
layer order, allowlisted font family/style, image opacity/radius, QR/photo borders, shapes and
gradients. Unsupported or out-of-range style values fail closed or normalize to documented safe
defaults; arbitrary CSS is never accepted.
