# Permissions

| Permission | Purpose |
| --- | --- |
| `wattanam.document-designer.view` | Read templates and previews. |
| `wattanam.document-designer.edit` | Create, edit, activate and remove templates. |
| `wattanam.document-designer.generate` | Build a bounded render model from an existing template and already-authorized input records. |
| `wattanam.document-designer.print` | Print or export a generated host render model. |

Generation does not grant unrestricted access to person records. Its endpoint accepts at most 500
already-authorized JSON records and does not query Academic, HR, or another plugin's tables. The
calling domain must retain its row-scope decision. The host provides bounded print, CSV, and PDF
output from the returned records; design-faithful cards/certificates still require certification.
