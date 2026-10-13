-- wattanam-plugin-migration: 059_allow_staff_attendance_sessions
ALTER TABLE plugin_wattanam_academic_management_attendance_session
  ADD CONSTRAINT academic_management_attendance_session_supported_scopes
  CHECK ("scope" IN ('STUDENT', 'TEACHER', 'STAFF')) NOT VALID
;
