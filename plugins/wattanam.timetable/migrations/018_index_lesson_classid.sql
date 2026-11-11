-- wattanam-plugin-migration: 018_index_lesson_classid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_lesson_classid_idx ON plugin_wattanam_timetable_lesson ("classId");
