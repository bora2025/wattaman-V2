-- wattanam-plugin-migration: 004_create_quiz_answer
CREATE TABLE plugin_wattanam_learning_quiz_answer (
  "id" TEXT PRIMARY KEY, "submissionId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_assignment_submission("id") ON DELETE CASCADE,
  "questionId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_quiz_question("id") ON DELETE CASCADE, "response" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "pointsAwarded" DOUBLE PRECISION CHECK ("pointsAwarded" IS NULL OR "pointsAwarded" >= 0), "autoGraded" BOOLEAN NOT NULL DEFAULT FALSE, "feedback" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("submissionId","questionId")
);
