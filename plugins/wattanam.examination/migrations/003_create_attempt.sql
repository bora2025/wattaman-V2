-- wattanam-plugin-migration: 003_create_attempt
CREATE TABLE plugin_wattanam_examination_attempt (
  "id" TEXT PRIMARY KEY,
  "examId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_exam("id") ON DELETE CASCADE,
  "academicStudentId" TEXT NOT NULL, "answers" JSONB, "manualMarks" JSONB,
  "feedback" TEXT, "score" DOUBLE PRECISION, "grade" TEXT,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK ("status" IN ('IN_PROGRESS','SUBMITTED','GRADED')),
  "attemptNumber" INTEGER NOT NULL DEFAULT 0 CHECK ("attemptNumber" >= 0),
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMPTZ, "gradedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("examId", "academicStudentId")
);
