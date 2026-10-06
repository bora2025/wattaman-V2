-- wattanam-plugin-migration: 014_create_officer_attendance_part_04
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_officer_attendance_date_idx
  ON plugin_wattanam_academic_management_officer_attendance ("attendanceDate", "status")
;

