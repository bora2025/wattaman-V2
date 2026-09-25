-- wattanam-plugin-migration: 006_create_score_subject
CREATE TABLE plugin_wattanam_examination_score_subject (
  "id" TEXT PRIMARY KEY,
  "scoreSheetId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_score_sheet("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100 CHECK ("maxScore" >= 0),
  "color" TEXT NOT NULL DEFAULT '#000000', "order" INTEGER NOT NULL DEFAULT 0,
  "academicSubjectId" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
