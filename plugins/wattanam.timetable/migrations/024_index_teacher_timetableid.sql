-- wattanam-plugin-migration: 024_index_teacher_timetableid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_teacher_timetableid_idx ON plugin_wattanam_timetable_teacher ("timetableId");
