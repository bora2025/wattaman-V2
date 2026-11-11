-- wattanam-plugin-migration: 022_index_quiz_question_assignmentid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_learning_quiz_question_assignmentid_idx ON plugin_wattanam_learning_quiz_question ("assignmentId");
