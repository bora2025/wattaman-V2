-- wattanam-plugin-migration: 012_create_course_attendance
CREATE TABLE plugin_wattanam_learning_course_attendance (
  "id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_course_session("id") ON DELETE CASCADE,
  "academicStudentId" TEXT NOT NULL, "directoryUserId" TEXT, "status" TEXT NOT NULL DEFAULT 'PRESENT' CHECK ("status" IN ('PRESENT','LATE','ABSENT','EXCUSED')),
  "source" TEXT NOT NULL DEFAULT 'MANUAL' CHECK ("source" IN ('MANUAL','AUTO_LESSON','CODE')), "checkInTime" TIMESTAMPTZ, "notes" TEXT,
  "markedByDirectoryUserId" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("sessionId","academicStudentId")
);
