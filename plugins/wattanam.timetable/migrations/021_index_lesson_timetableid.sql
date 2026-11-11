-- wattanam-plugin-migration: 021_index_lesson_timetableid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_lesson_timetableid_idx ON plugin_wattanam_timetable_lesson ("timetableId");
