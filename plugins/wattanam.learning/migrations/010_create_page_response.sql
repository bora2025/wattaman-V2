-- wattanam-plugin-migration: 010_create_page_response
CREATE TABLE plugin_wattanam_learning_page_response (
  "id" TEXT PRIMARY KEY, "attemptId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_lesson_attempt("id") ON DELETE CASCADE,
  "pageId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_lesson_page("id") ON DELETE CASCADE, "answer" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "correct" BOOLEAN, "pointsAwarded" DOUBLE PRECISION CHECK ("pointsAwarded" IS NULL OR "pointsAwarded" >= 0), "nextPageId" TEXT,
  "answeredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("attemptId","pageId")
);
