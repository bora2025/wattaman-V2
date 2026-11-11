-- wattanam-plugin-migration: 066_index_attendance_self_scan_recordid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_sel_3029a104_idx ON plugin_wattanam_academic_management_attendance_self_scan ("recordId");
