-- wattanam-plugin-migration: 014_index_entry_classroomid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_entry_classroomid_idx ON plugin_wattanam_timetable_entry ("classroomId");
