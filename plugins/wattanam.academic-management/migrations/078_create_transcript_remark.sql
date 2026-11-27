-- wattanam-plugin-migration: 078_create_transcript_remark
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_transcript_remark (
  "id" TEXT PRIMARY KEY,
  "tabId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_transcript_tab("id") ON DELETE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_student_profile("id") ON DELETE CASCADE,
  "conduct" TEXT,
  "comment" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tabId", "studentId")
);
