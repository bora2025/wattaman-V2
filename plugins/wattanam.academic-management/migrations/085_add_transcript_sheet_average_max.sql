-- wattanam-plugin-migration: 085_add_transcript_sheet_average_max
ALTER TABLE plugin_wattanam_academic_management_transcript_sheet ADD COLUMN IF NOT EXISTS "averageMax" DOUBLE PRECISION CHECK ("averageMax" IS NULL OR ("averageMax" > 0 AND "averageMax" <= 1000));
