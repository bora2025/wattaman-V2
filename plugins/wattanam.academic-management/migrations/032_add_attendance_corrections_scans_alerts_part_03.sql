-- wattanam-plugin-migration: 032_add_attendance_corrections_scans_alerts_part_03
CREATE INDEX IF NOT EXISTS "academic_management_attendance_correction_record_created"
  ON "plugin_wattanam_academic_management_attendance_correction" ("recordId", "createdAt")
;

