-- wattanam-plugin-migration: 012_index_score_entry_subjectid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_examination_score_entry_subjectid_idx ON plugin_wattanam_examination_score_entry ("subjectId");
