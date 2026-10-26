-- wattanam-plugin-migration: 062_seed_student_attendance_sessions
INSERT INTO plugin_wattanam_academic_management_attendance_session
  ("id", "scope", "classId", "session", "type", "startTime", "endTime")
VALUES
  ('student-default-session-1', 'STUDENT', '', 1, 'CHECK_IN',  '05:00', '11:29'),
  ('student-default-session-2', 'STUDENT', '', 2, 'CHECK_OUT', '11:30', '12:29'),
  ('student-default-session-3', 'STUDENT', '', 3, 'CHECK_IN',  '12:30', '16:59'),
  ('student-default-session-4', 'STUDENT', '', 4, 'CHECK_OUT', '17:00', '23:00')
ON CONFLICT ("scope", "classId", "session") DO NOTHING
;
