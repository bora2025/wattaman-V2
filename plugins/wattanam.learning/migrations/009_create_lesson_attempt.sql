-- wattanam-plugin-migration: 009_create_lesson_attempt
CREATE TABLE plugin_wattanam_learning_lesson_attempt (
  "id" TEXT PRIMARY KEY, "lessonId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_lesson("id") ON DELETE CASCADE,
  "academicStudentId" TEXT NOT NULL, "directoryUserId" TEXT, "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK ("status" IN ('IN_PROGRESS','COMPLETED','AWAITING_GRADE','ABANDONED')),
  "currentPageId" TEXT, "score" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("score" >= 0), "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("maxScore" >= 0),
  "passed" BOOLEAN, "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMPTZ
);
