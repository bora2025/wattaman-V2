-- wattanam-plugin-migration: 055_create_self_attendance_part_10
CREATE INDEX IF NOT EXISTS academic_management_attendance_self_scan_review
  ON plugin_wattanam_academic_management_attendance_self_scan ("reviewStatus", "receivedAt")
;

