-- wattanam-plugin-migration: 002_create_question
CREATE TABLE plugin_wattanam_examination_question (
  "id" TEXT PRIMARY KEY,
  "examId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_exam("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'MCQ', "data" JSONB,
  "marks" DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK ("marks" >= 0),
  "order" INTEGER NOT NULL DEFAULT 0, "section" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
