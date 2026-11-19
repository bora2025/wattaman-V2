-- wattanam-plugin-migration: 089_add_transcript_sheet_kind
ALTER TABLE plugin_wattanam_academic_management_transcript_sheet ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'SCHOOL';
