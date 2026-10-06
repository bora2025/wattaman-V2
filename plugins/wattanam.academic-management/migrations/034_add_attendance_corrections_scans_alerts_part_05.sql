-- wattanam-plugin-migration: 034_add_attendance_corrections_scans_alerts_part_05
CREATE INDEX IF NOT EXISTS "academic_management_attendance_scan_principal_received"
  ON "plugin_wattanam_academic_management_attendance_scan" ("principalId", "receivedAt")
;

