-- wattanam-plugin-migration: 003_create_quiz_question
CREATE TABLE plugin_wattanam_learning_quiz_question (
  "id" TEXT PRIMARY KEY, "assignmentId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_assignment("id") ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0 CHECK ("order" >= 0), "type" TEXT NOT NULL, "prompt" TEXT NOT NULL,
  "points" DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK ("points" >= 0), "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
