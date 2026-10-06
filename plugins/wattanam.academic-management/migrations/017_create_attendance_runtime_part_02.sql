-- wattanam-plugin-migration: 017_create_attendance_runtime_part_02
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_one_current_year
  ON plugin_wattanam_academic_management_study_year ("isCurrent") WHERE "isCurrent" = TRUE
;

