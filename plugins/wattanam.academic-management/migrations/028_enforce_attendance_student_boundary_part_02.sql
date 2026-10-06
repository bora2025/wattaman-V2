-- wattanam-plugin-migration: 028_enforce_attendance_student_boundary_part_02
ALTER TABLE "plugin_wattanam_academic_management_attendance_identifier"
  ADD CONSTRAINT "academic_management_attendance_identifier_student_only"
  CHECK ("personType" = 'STUDENT') NOT VALID
;

