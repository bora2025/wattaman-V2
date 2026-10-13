-- wattanam-plugin-migration: 058_seed_staff_attendance_sessions
INSERT INTO plugin_wattanam_academic_management_attendance_session
  ("id", "scope", "classId", "session", "type", "startTime", "endTime")
VALUES
  ('staff-default-session-1', 'STAFF', '', 1, 'CHECK_IN',  '07:00', '07:30'),
  ('staff-default-session-2', 'STAFF', '', 2, 'CHECK_OUT', '11:30', '12:00'),
  ('staff-default-session-3', 'STAFF', '', 3, 'CHECK_IN',  '13:00', '13:30'),
  ('staff-default-session-4', 'STAFF', '', 4, 'CHECK_OUT', '17:00', '17:30')
ON CONFLICT ("scope", "classId", "session") DO NOTHING
;
