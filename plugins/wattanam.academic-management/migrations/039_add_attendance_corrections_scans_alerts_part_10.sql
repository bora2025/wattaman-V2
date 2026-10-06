-- wattanam-plugin-migration: 039_add_attendance_corrections_scans_alerts_part_10
CREATE INDEX IF NOT EXISTS "academic_management_attendance_alert_person_window"
  ON "plugin_wattanam_academic_management_attendance_alert" ("personId", "windowStart", "windowEnd")
;

