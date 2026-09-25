-- wattanam-plugin-migration: 004_create_score_sheet
CREATE TABLE plugin_wattanam_examination_score_sheet (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "degree" TEXT, "logoUrl" TEXT,
  "studyYearId" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
