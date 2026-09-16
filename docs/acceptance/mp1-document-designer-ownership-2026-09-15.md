# Document Designer ownership and scope inventory

Status: initial extraction scope; no legacy cutover or production certification claimed.

## Owned feature

- Backend: `backend/src/card-templates/` supplies list, detail, create, delete and shared active
  design routes under `/card-templates`. `backend/prisma/schema.prisma` stores `CardTemplate`
  (`id`, `name`, `cardType`, JSON `design`, timestamps). Active designs use name `__active__`.
- Browser editor: `frontend/app/admin/card-designer/` (index, new, student, staff,
  teacher-part-time, print) and `frontend/components/card-designer/` (canvas, toolbar, rendering,
  PDF generation, type and template API helpers). Local-storage design/template caches also exist.
- Generation and printing: `/admin/student-cards`, `/admin/staff-cards`, `/admin/certificate`,
  `/admin/qr-codes`, `/employee/my-card`, plus card-designer print. Student/staff cards and
  certificates resolve person/class/department data through existing school APIs; bulk PDF/PNG
  and QR workflows are not covered by a template-list page.
- No standalone backend certificate/QR persistence module was found; QR and rendered output are
  currently derived in the browser. Scanning and attendance QR interpretation belong elsewhere.

## Scope decision

`/tools/latex-editor` is excluded. It is a standalone math/text authoring tool used outside
cards and certificates; it should become a separate optional Tool plugin after its own browser
security and MathJax/dependency review. This plugin owns document templates, card/certificate/QR
composition, preview, authorized bulk generation and print/export.

## Dependencies and cutover controls

- Academic student/class/enrollment and HR employee data require versioned, row-scoped read
  contracts; core account identity is not a substitute for domain profiles.
- Canvas editor, previews, scoped assets, PDFs and device/browser printing need host-approved UI
  extension support. Do not execute arbitrary plugin JavaScript in the core browser origin.
- Copy legacy templates with a journal, compare IDs, JSON designs, active-by-type and rendered
  previews, then switch to a thin compatibility proxy. Keep legacy rows and local-storage import
  path during the rollback window. The namespaced create-table migration alone is not adoption.
- Permissions are `view`, `edit`, `generate` and `print`, with independently checked route and
  person-row authorization. Disabling preserves template and asset data.
