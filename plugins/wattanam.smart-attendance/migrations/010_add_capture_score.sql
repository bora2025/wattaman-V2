-- wattanam-plugin-migration: 010_add_capture_score
ALTER TABLE plugin_wattanam_smart_attendance_capture ADD COLUMN IF NOT EXISTS "score" REAL, ADD COLUMN IF NOT EXISTS "margin" REAL;
