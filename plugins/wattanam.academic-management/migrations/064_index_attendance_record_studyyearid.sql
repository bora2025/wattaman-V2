-- wattanam-plugin-migration: 064_index_attendance_record_studyyearid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_rec_467cc5ac_idx ON plugin_wattanam_academic_management_attendance_record ("studyYearId");
