-- wattanam-plugin-migration: 016_index_course_session_lessonid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_learning_course_session_lessonid_idx ON plugin_wattanam_learning_course_session ("lessonId");
