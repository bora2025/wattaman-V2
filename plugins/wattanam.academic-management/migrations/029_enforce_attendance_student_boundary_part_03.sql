-- wattanam-plugin-migration: 029_enforce_attendance_student_boundary_part_03
ALTER TABLE "plugin_wattanam_academic_management_attendance_session"
  ADD CONSTRAINT "academic_management_attendance_session_student_only"
  CHECK ("scope" = 'STUDENT') NOT VALID
;

