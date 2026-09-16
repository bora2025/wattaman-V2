# Data model

`plugin_wattanam_document_designer_template` belongs exclusively to this plugin. It contains
`id`, `name`, `documentType`, a JSON `design`, `isActive`, and timestamps. A generated nullable
`activeDocumentType` column with a unique constraint allows at most one active template per type
in the single-statement plugin migration format.

Legacy `CardTemplate` uses `cardType` and a `__active__` sentinel name. Adoption must map the
sentinel to `isActive`, preserve IDs and designs, reconcile rows and rendered output, and retain
the source table for rollback. That adoption is not implemented by this initial migration.

Assets will use scoped plugin storage. No person records or other plugin tables are joined here.
