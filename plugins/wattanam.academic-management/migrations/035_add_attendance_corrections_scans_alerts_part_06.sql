-- wattanam-plugin-migration: 035_add_attendance_corrections_scans_alerts_part_06
CREATE INDEX IF NOT EXISTS "academic_management_attendance_scan_code_received"
  ON "plugin_wattanam_academic_management_attendance_scan" ("codeHash", "receivedAt")
;

