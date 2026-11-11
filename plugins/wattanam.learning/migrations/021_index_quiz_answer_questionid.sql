-- wattanam-plugin-migration: 021_index_quiz_answer_questionid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_learning_quiz_answer_questionid_idx ON plugin_wattanam_learning_quiz_answer ("questionId");
