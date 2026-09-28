# WordPress-style Document Designer PostgreSQL certification

Date: 2026-09-26  
Status: CI certification implemented; first hosted workflow run pending

## Certification command

`npm run certify:document-designer:postgres` requires the exact
`DOCUMENT_DESIGNER_CERTIFY_ALLOW_DROP=document-designer-only` guard and operates only on the
`plugin_wattanam_document_designer_` namespace. It:

- verifies the immutable migration checksum and migration identity header;
- activates the actual Document Designer plugin with a PostgreSQL-backed database adapter;
- creates independent student document templates;
- exercises concurrent template activation and proves the database-enforced single-active-template
  invariant;
- generates a bounded document model through an allow-listed binding;
- verifies plugin-scoped asset write, read and delete lifecycle; and
- rejects storage path traversal outside the plugin namespace.

The PostgreSQL 16 PR backend job runs this command after the Academic Management, Human Resources
and Communication certifications.

## Local verification

- Certification guard and migration tests: 2 passed.
- Document Designer source, behavior, row-scope and certification suites: 12 passed.
- Architecture and clean-core gates are rerun whenever this evidence changes.

## Remaining acceptance gap

The first hosted PostgreSQL run, restored-backup adoption and rollback drill, browser parity for
preview/print/export, object-storage provider certification and a controlled school pilot remain
required before production cutover.
