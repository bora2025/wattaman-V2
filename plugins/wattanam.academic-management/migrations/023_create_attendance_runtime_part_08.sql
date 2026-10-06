-- wattanam-plugin-migration: 023_create_attendance_runtime_part_08
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_record_date
  ON plugin_wattanam_academic_management_attendance_record ("date")
;

