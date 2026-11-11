-- wattanam-plugin-migration: 015_index_entry_lessonid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_entry_lessonid_idx ON plugin_wattanam_timetable_entry ("lessonId");
