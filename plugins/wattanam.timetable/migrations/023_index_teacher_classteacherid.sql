-- wattanam-plugin-migration: 023_index_teacher_classteacherid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_timetable_teacher_classteacherid_idx ON plugin_wattanam_timetable_teacher ("classTeacherId");
