-- wattanam-plugin-migration: 047_create_self_attendance_part_02
CREATE UNIQUE INDEX IF NOT EXISTS academic_management_attendance_staff_record_unique
  ON plugin_wattanam_academic_management_attendance_record ("personId", "date", "session")
  WHERE "personType" = 'STAFF'
;

