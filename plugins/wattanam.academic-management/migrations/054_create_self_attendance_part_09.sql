-- wattanam-plugin-migration: 054_create_self_attendance_part_09
CREATE INDEX IF NOT EXISTS academic_management_attendance_self_scan_student_received
  ON plugin_wattanam_academic_management_attendance_self_scan ("studentProfileId", "receivedAt")
;

