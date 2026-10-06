-- wattanam-plugin-migration: 018_create_attendance_runtime_part_03
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_session (
  "id" TEXT PRIMARY KEY,
  "scope" TEXT NOT NULL CHECK ("scope" IN ('STUDENT', 'TEACHER', 'STAFF')),
  "classId" TEXT NOT NULL DEFAULT '',
  "session" INTEGER NOT NULL CHECK ("session" BETWEEN 1 AND 4),
  "type" TEXT NOT NULL CHECK ("type" IN ('CHECK_IN', 'CHECK_OUT')),
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("scope", "classId", "session")
)
;

