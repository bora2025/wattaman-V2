# MP-1 Document Designer bounded render model

Date: 2026-09-23  
Status: local implementation verified; browser parity and hosted certification remain open

## Implemented

- Document Designer 0.1.3 converts stored designs into a normalized schema-v2 render model.
- Page width/height, element count, coordinates, dimensions, rotations, typography, colors,
  bindings and output lengths are bounded and validated server-side.
- Text and QR elements resolve data paths only against the record already supplied by the calling
  domain. The plugin does not query Academic, HR or another business schema.
- Image elements reference UUID assets in the plugin's host-scoped storage; the host retrieves them
  through the permission-gated plugin route.
- The generic host gained a declarative `document` component. It renders positioned text, images
  and QR codes as React content and exposes print/Save-as-PDF through the browser print surface.
  Arbitrary plugin HTML, scripts, external URLs and event handlers remain prohibited by the UI-v2
  parser.
- The generic host also gained a declarative `designer` component with a live canvas, page controls,
  text/image/QR element creation, selection, positioning, sizing, binding and scoped-asset choice.
  Template table rows now navigate directly to the editor.
- Schema-v2 designs are normalized and bounded on create/update. Legacy CardDesign payloads remain
  unchanged during the rollback window and are not silently converted.
- Tabular CSV export remains separate. It is no longer described as design-faithful output.

## Verification

- Document Designer reference suite: 8/8 passed, including resolved nested bindings and bounded
  document output.
- Plugin UI-v2 schema suite: 26/26 passed, including the Document Designer `document` declaration.
- Frontend production build: passed, 129 routes generated.
- Package CLI validation and activation harness: passed for 0.1.3.
- Backend production build: passed (302 files compiled).
- Originating Academic row-scope pipeline: 1/1 passed. An unassigned teacher is denied before any
  rows are returned; the assigned teacher receives one minimized record; Document Designer renders
  it while issuing exactly one query to its own namespaced template table and no Academic query.
- Academic reference suite: 9/9 passed. Class list/detail and roster reads/mutations constrain
  teachers and class administrators to their assignments; orphan cleanup is administrator-only.

## Not yet certified

- Academic class-roster row scope is locally proven. Equivalent HR/staff and any future source
  contracts, plus hosted authorization verification, remain required; Document Designer
  deliberately cannot widen or independently discover rows.
- Pixel/output comparison against representative legacy cards and certificates is still required.
- Drag/resize editor polish, supported-browser checks, clean marketplace installation, restored-backup
  adoption, lifecycle/recovery, pilot and rollback-window approval remain open.
