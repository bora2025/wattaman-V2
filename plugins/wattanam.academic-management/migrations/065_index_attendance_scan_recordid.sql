-- wattanam-plugin-migration: 065_index_attendance_scan_recordid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_sca_f32debdf_idx ON plugin_wattanam_academic_management_attendance_scan ("recordId");
