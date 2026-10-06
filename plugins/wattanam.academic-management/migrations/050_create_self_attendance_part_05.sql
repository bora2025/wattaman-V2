-- wattanam-plugin-migration: 050_create_self_attendance_part_05
CREATE INDEX IF NOT EXISTS academic_management_attendance_window_class_status
  ON plugin_wattanam_academic_management_attendance_window ("classId", "status", "startsAt", "endsAt")
;

