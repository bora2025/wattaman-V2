-- wattanam-plugin-migration: 002_create_assignment_submission
CREATE TABLE plugin_wattanam_learning_assignment_submission (
  "id" TEXT PRIMARY KEY, "assignmentId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_assignment("id") ON DELETE CASCADE,
  "academicStudentId" TEXT NOT NULL, "directoryUserId" TEXT, "content" TEXT, "attachmentUrl" TEXT, "marks" DOUBLE PRECISION CHECK ("marks" IS NULL OR "marks" >= 0),
  "feedback" TEXT, "status" TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK ("status" IN ('SUBMITTED','LATE','GRADED')), "attemptNumber" INTEGER NOT NULL DEFAULT 1 CHECK ("attemptNumber" > 0),
  "latePenaltyApplied" DOUBLE PRECISION CHECK ("latePenaltyApplied" IS NULL OR "latePenaltyApplied" >= 0), "quizStartedAt" TIMESTAMPTZ,
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "gradedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("assignmentId","academicStudentId")
);
