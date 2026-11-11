-- wattanam-plugin-migration: 007_index_alert_ruleid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_attendance_manager_alert_ruleid_idx ON plugin_wattanam_attendance_manager_alert ("ruleId");
