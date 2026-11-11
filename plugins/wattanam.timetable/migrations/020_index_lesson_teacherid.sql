-- wattanam-plugin-migration: 020_index_lesson_teacherid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_lesson_teacherid_idx ON plugin_wattanam_timetable_lesson ("teacherId");
