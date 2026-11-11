-- wattanam-plugin-migration: 068_index_scan_attempt_recordid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_organizing_management_scan_attempt_recordid_idx ON plugin_wattanam_organizing_management_scan_attempt ("recordId");
