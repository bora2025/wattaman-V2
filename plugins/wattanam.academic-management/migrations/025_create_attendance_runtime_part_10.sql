-- wattanam-plugin-migration: 025_create_attendance_runtime_part_10
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_record_class
  ON plugin_wattanam_academic_management_attendance_record ("classId", "date")
;

