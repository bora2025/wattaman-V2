-- wattanam-plugin-migration: 053_create_self_attendance_part_08
CREATE INDEX IF NOT EXISTS academic_management_attendance_self_scan_window_received
  ON plugin_wattanam_academic_management_attendance_self_scan ("attendanceWindowId", "receivedAt")
;

