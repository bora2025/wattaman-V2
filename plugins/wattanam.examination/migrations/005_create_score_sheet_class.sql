-- wattanam-plugin-migration: 005_create_score_sheet_class
CREATE TABLE plugin_wattanam_examination_score_sheet_class (
  "id" TEXT PRIMARY KEY,
  "scoreSheetId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_score_sheet("id") ON DELETE CASCADE,
  "academicClassId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("scoreSheetId", "academicClassId")
);
