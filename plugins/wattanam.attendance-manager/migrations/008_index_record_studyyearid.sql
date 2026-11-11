-- wattanam-plugin-migration: 008_index_record_studyyearid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_attendance_manager_record_studyyearid_idx ON plugin_wattanam_attendance_manager_record ("studyYearId");
