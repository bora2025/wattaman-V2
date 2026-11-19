-- wattanam-plugin-migration: 069_create_transcript_sheet_class
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_transcript_sheet_class (
  "id" TEXT PRIMARY KEY,
  "sheetId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_transcript_sheet("id") ON DELETE CASCADE,
  "classId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_class("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("sheetId", "classId")
);
