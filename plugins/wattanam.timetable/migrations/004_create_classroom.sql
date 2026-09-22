-- wattanam-plugin-migration: 004_create_classroom
CREATE TABLE plugin_wattanam_timetable_classroom (
  "id" TEXT PRIMARY KEY,
  "timetableId" TEXT NOT NULL REFERENCES plugin_wattanam_timetable_document("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "short" TEXT NOT NULL,
  "color" TEXT,
  "picture" TEXT,
  "customFields" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
