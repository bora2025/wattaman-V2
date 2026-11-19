-- wattanam-plugin-migration: 073_create_transcript_tab
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_transcript_tab (
  "id" TEXT PRIMARY KEY,
  "sheetId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_transcript_sheet("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'MONTHLY' CHECK ("type" IN ('MONTHLY', 'QUARTERLY', 'SEMESTER')),
  "order" INTEGER NOT NULL DEFAULT 0,
  "periodStart" DATE,
  "periodEnd" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" <= "periodEnd")
);
