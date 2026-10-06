-- wattanam-plugin-migration: 012_create_officer_attendance_part_02
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_officer_profile_department_idx
  ON plugin_wattanam_academic_management_officer_profile ("departmentId", "employmentStatus")
;

