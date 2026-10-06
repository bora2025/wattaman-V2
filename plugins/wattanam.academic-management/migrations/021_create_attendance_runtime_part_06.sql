-- wattanam-plugin-migration: 021_create_attendance_runtime_part_06
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_identifier_person
  ON plugin_wattanam_academic_management_attendance_identifier ("personType", "personId")
;

