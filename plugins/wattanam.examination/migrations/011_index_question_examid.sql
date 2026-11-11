-- wattanam-plugin-migration: 011_index_question_examid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_examination_question_examid_idx ON plugin_wattanam_examination_question ("examId");
