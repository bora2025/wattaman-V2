-- wattanam-plugin-migration: 002_create_subject
CREATE TABLE plugin_wattanam_timetable_subject (
  "id" TEXT PRIMARY KEY,
  "timetableId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_document("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "short" TEXT NOT NULL,
  "color" TEXT,
  "picture" TEXT,
  "classroomCount" INTEGER NOT NULL DEFAULT 1 CHECK ("classroomCount" > 0),
  "customFields" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
