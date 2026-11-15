-- wattanam-plugin-migration: 071_create_transcript_subject
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_transcript_subject (
  "id" TEXT PRIMARY KEY,
  "sheetId" TEXT NOT NULL REFERENCES plugin_wattanam_academic_management_transcript_sheet("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100 CHECK ("maxScore" > 0),
  "color" TEXT NOT NULL DEFAULT '#334155',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
