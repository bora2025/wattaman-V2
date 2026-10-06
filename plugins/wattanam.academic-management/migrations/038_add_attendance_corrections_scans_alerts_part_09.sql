-- wattanam-plugin-migration: 038_add_attendance_corrections_scans_alerts_part_09
CREATE INDEX IF NOT EXISTS "academic_management_attendance_alert_status_created"
  ON "plugin_wattanam_academic_management_attendance_alert" ("status", "createdAt")
;

