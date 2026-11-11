-- wattanam-plugin-migration: 022_index_subject_timetableid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_subject_timetableid_idx ON plugin_wattanam_timetable_subject ("timetableId");
