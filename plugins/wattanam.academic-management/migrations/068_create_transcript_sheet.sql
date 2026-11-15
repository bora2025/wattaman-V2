-- wattanam-plugin-migration: 068_create_transcript_sheet
-- Academic transcripts (monthly bulletins): score sheets, their classes, subjects, exam months, scores and remarks.
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_transcript_sheet (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "degree" TEXT,
  "studyYearId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
