-- wattanam-plugin-migration: 030_add_attendance_corrections_scans_alerts_part_01
ALTER TABLE "plugin_wattanam_academic_management_attendance_record"
  ADD COLUMN IF NOT EXISTS "personNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "personNumberSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "classNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "studyYearLabelSnapshot" TEXT
;

