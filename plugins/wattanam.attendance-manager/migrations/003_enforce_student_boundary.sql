-- wattanam-plugin-migration: 003_enforce_student_boundary
-- Preserve any excluded legacy rows for export/rollback, but reject new or modified rows that
-- violate ADR-0019. NOT VALID deliberately avoids mutating or deleting historical data.
ALTER TABLE "plugin_wattanam_attendance_manager_record"
  ADD CONSTRAINT "attendance_manager_record_student_only"
  CHECK ("personType" = 'STUDENT') NOT VALID;

ALTER TABLE "plugin_wattanam_attendance_manager_identifier"
  ADD CONSTRAINT "attendance_manager_identifier_student_only"
  CHECK ("personType" = 'STUDENT') NOT VALID;

ALTER TABLE "plugin_wattanam_attendance_manager_session"
  ADD CONSTRAINT "attendance_manager_session_student_only"
  CHECK ("scope" = 'STUDENT') NOT VALID;
