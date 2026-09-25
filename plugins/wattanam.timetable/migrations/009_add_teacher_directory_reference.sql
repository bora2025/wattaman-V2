-- wattanam-plugin-migration: 009_add_teacher_directory_reference
-- Stable core identity identifier with historical local display snapshots.
ALTER TABLE "plugin_wattanam_timetable_teacher"
  ADD COLUMN IF NOT EXISTS "directoryUserId" TEXT;
