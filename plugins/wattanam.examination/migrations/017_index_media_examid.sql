-- wattanam-plugin-migration: 017_index_media_examid
-- Covering index for a foreign key, so an exam's files are found and deleted without a table scan.
CREATE INDEX IF NOT EXISTS plugin_wattanam_examination_media_examid_idx ON plugin_wattanam_examination_media ("examId");
