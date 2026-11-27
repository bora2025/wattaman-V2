-- wattanam-plugin-migration: 086_add_transcript_sheet_grade_scale
ALTER TABLE plugin_wattanam_academic_management_transcript_sheet ADD COLUMN IF NOT EXISTS "gradeScale" JSONB;
