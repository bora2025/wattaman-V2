# Migrations

`001_create_template.sql` creates only `plugin_wattanam_document_designer_template`.
The backend migration verifier requires one SQL statement per file and the normalized
`plugin_wattanam_document_designer_` table namespace. Each published migration and checksum
is immutable; subsequent schema changes need a new migration ID.

Legacy adoption is a separate, journaled copy/reconcile/rollback workflow. Running this
create-table migration does not migrate legacy `CardTemplate` rows.
