-- wattanam-plugin-migration: 009_index_scan_recordid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_attendance_manager_scan_recordid_idx ON plugin_wattanam_attendance_manager_scan ("recordId");
