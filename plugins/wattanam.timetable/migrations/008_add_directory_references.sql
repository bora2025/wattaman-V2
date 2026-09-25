-- wattanam-plugin-migration: 008_add_directory_references
-- Stable cross-plugin identifiers keep display names as local snapshots.
ALTER TABLE "plugin_wattanam_timetable_class"
  ADD COLUMN IF NOT EXISTS "academicClassId" TEXT;
