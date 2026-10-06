-- wattanam-plugin-migration: 024_create_attendance_runtime_part_09
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_record_person
  ON plugin_wattanam_academic_management_attendance_record ("personType", "personId", "date")
;

