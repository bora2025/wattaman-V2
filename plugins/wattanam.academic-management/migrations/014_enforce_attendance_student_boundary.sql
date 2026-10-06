-- wattanam-plugin-migration: 014_enforce_attendance_student_boundary
-- Preserve any excluded legacy rows for export/rollback, but reject new or modified rows that
-- violate ADR-0019. NOT VALID deliberately avoids mutating or deleting historical data.
ALTER TABLE "plugin_wattanam_academic_management_attendance_record"
  ADD CONSTRAINT "academic_management_attendance_record_student_only"
  CHECK ("personType" = 'STUDENT') NOT VALID;

ALTER TABLE "plugin_wattanam_academic_management_attendance_identifier"
  ADD CONSTRAINT "academic_management_attendance_identifier_student_only"
  CHECK ("personType" = 'STUDENT') NOT VALID;

ALTER TABLE "plugin_wattanam_academic_management_attendance_session"
  ADD CONSTRAINT "academic_management_attendance_session_student_only"
  CHECK ("scope" = 'STUDENT') NOT VALID;


