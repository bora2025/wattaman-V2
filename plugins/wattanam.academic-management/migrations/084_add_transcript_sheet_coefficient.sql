-- wattanam-plugin-migration: 084_add_transcript_sheet_coefficient
ALTER TABLE plugin_wattanam_academic_management_transcript_sheet ADD COLUMN IF NOT EXISTS "coefficient" DOUBLE PRECISION CHECK ("coefficient" IS NULL OR ("coefficient" > 0 AND "coefficient" <= 100));
