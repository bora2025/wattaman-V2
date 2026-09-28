# Changelog

## 0.1.7

- Declare database and file backup participation plus the complete operational contract.

## 0.1.6

- Preserve bounded legacy page frames and element layer order in the schema-v2 projection.
- Preserve allowlisted font family/style, image opacity/radius, and QR/photo border styling.
- Render those compatibility properties in both the host editor and print preview without loading
  plugin JavaScript in the school origin.

## 0.1.5

- Add backup/journal-bound, content-deduplicated migration of embedded legacy images into
  plugin-scoped storage while retaining legacy sources for rollback and output comparison.
- Project converted legacy text, image, and QR elements into the bounded schema-v2 render model.
- Add host-rendered rectangle/circle/line shapes and project bounded solid legacy shapes into the
  same safe model, including validated linear/radial gradients and solid/dashed/dotted borders;
  fail closed on malformed style tokens or images that have not entered scoped storage instead of
  silently omitting them.
- Add a host-rendered person-photo placeholder backed only by an authorized record binding;
  accept bounded canonical embedded raster data or same-origin paths and reject remote URLs and
  unsafe schemes server-side.

## 0.1.4

- Add a bounded staff document-source adapter using Directory identities and Human Resources'
  privacy-minimized profile projection.
- Reject missing, duplicate, student and parent identities and expose no email, payroll or CV data.
- Keep Human Resources optional so basic staff labels still work when no profile was published.
- Add page-bounded pointer drag and resize controls to the host-owned visual editor.

## 0.1.3

- Generate a normalized, bounded page-and-element render model from template designs.
- Resolve text and QR bindings against only the caller-supplied, already-authorized record.
- Add the host-owned `document` UI component for positioned text, scoped images, QR codes,
  browser printing, and Save-as-PDF without arbitrary plugin HTML or JavaScript.
- Add a host-owned visual designer with a live canvas, bounded page/element controls, scoped image
  selection, and direct row navigation from the template list.
- Normalize schema-v2 designs at write time while preserving legacy design payloads during the
  rollback window.
- Keep CSV export as a separate tabular representation instead of presenting it as faithful output.

## 0.1.2

- Add a permission-gated, bounded render-model generation endpoint for already-authorized records.
- Keep person/roster lookup outside the plugin to preserve domain ownership and row-scope decisions.
- Connect scoped image assets to the host upload, preview, download, and delete interface.

## 0.1.1

- Add quota-enforced, plugin-scoped binary asset upload, list, read, and delete routes.
- Restrict assets to generated identifiers, safe file names, canonical base64, and an image/font MIME allowlist.

## 0.1.0

Initial scaffold.
