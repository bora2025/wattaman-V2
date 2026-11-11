-- wattanam-plugin-migration: 019_index_lesson_subjectid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_lesson_subjectid_idx ON plugin_wattanam_timetable_lesson ("subjectId");
