-- wattanam-plugin-migration: 017_index_lesson_courseid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_learning_lesson_courseid_idx ON plugin_wattanam_learning_lesson ("courseId");
