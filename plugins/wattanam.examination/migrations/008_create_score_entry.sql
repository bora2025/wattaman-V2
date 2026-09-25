-- wattanam-plugin-migration: 008_create_score_entry
CREATE TABLE plugin_wattanam_examination_score_entry (
  "id" TEXT PRIMARY KEY,
  "scoreTabId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_score_tab("id") ON DELETE CASCADE,
  "subjectId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_score_subject("id") ON DELETE CASCADE,
  "academicStudentId" TEXT NOT NULL, "score" DOUBLE PRECISION, "formula" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("scoreTabId", "subjectId", "academicStudentId")
);
