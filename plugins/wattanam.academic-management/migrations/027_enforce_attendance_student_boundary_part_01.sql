-- wattanam-plugin-migration: 027_enforce_attendance_student_boundary_part_01
-- Preserve any excluded legacy rows for export/rollback, but reject new or modified rows that
-- violate ADR-0019. NOT VALID deliberately avoids mutating or deleting historical data.
ALTER TABLE "plugin_wattanam_academic_management_attendance_record"
  ADD CONSTRAINT "academic_management_attendance_record_student_only"
  CHECK ("personType" = 'STUDENT') NOT VALID
;

