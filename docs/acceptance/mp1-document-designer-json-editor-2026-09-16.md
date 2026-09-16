# MP1 Document Designer JSON Editor — Local Evidence

Date: 2026-09-16
Status: partial MP1-005 implementation

The plugin declares a separate `wattanam.document-designer.edit` page at
`/plugins/wattanam.document-designer/templates/edit/:id`. It loads a template and submits
`name` plus a validated JSON object `design` to the existing permission-gated PATCH route.
The shared declarative form rejects invalid JSON and JSON arrays/scalars before mutation; it
does not execute plugin JavaScript in the core browser origin. The read-only detail page does
not expose the edit form.

The actual plugin descriptor now passes the backend UI schema check. The template list route
returns the `documentType` and `isActive` fields its table declares; the host supports a bounded
boolean table format. Plugin CLI check and six local plugin contract tests pass. Backend UI
schema suite passes 23/23; frontend TypeScript check passes. Three Playwright desktop tests
reported passing assertions, but the runner hung during web-server teardown and was stopped,
so the browser command did not have a clean exit code.

Open: discoverable editor navigation, rich canvas rendering/preview, bulk generation, print,
CSV/PDF, scoped assets, row-scope certification, hosted lifecycle and data adoption. The JSON
editor is an interim safe authoring surface, not complete MP1-005 certification.
