-- wattanam-plugin-migration: 003_create_class
CREATE TABLE plugin_wattanam_timetable_class (
  "id" TEXT PRIMARY KEY,
  "timetableId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_document("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "short" TEXT NOT NULL,
  "color" TEXT,
  "picture" TEXT,
  "printSubjectPicture" BOOLEAN NOT NULL DEFAULT FALSE,
  "customFields" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
