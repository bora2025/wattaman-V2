-- wattanam-plugin-migration: 015_create_officer_attendance_part_05
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_officer_attendance_officer_idx
  ON plugin_wattanam_academic_management_officer_attendance ("officerId", "attendanceDate" DESC)
;

