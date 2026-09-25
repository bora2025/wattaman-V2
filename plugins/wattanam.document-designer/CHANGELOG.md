# Changelog

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
