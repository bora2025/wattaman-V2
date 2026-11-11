-- wattanam-plugin-migration: 014_index_score_tab_scoresheetid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_examination_score_tab_scoresheetid_idx ON plugin_wattanam_examination_score_tab ("scoreSheetId");
