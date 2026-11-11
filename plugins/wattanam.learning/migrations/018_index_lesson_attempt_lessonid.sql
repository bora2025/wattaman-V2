-- wattanam-plugin-migration: 018_index_lesson_attempt_lessonid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_learning_lesson_attempt_lessonid_idx ON plugin_wattanam_learning_lesson_attempt ("lessonId");
