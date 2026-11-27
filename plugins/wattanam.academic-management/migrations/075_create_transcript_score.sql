-- wattanam-plugin-migration: 075_create_transcript_score
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_transcript_score (
  "id" TEXT PRIMARY KEY,
  "tabId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_transcript_tab("id") ON DELETE CASCADE,
  "subjectId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_transcript_subject("id") ON DELETE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_student_profile("id") ON DELETE CASCADE,
  "score" DOUBLE PRECISION CHECK ("score" IS NULL OR "score" >= 0),
  "updatedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tabId", "subjectId", "studentId")
);
