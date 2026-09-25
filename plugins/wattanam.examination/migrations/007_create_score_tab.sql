-- wattanam-plugin-migration: 007_create_score_tab
CREATE TABLE plugin_wattanam_examination_score_tab (
  "id" TEXT PRIMARY KEY,
  "scoreSheetId" TEXT NOT NULL REFERENCES plugin_wattanam_examination_score_sheet("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL, "type" TEXT NOT NULL CHECK ("type" IN ('MONTHLY','QUARTERLY','SEMESTER')),
  "order" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
