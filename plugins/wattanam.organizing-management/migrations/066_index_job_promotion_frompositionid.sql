-- wattanam-plugin-migration: 066_index_job_promotion_frompositionid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_organizing_management_job_promotio_59a94c43_idx ON plugin_wattanam_organizing_management_job_promotion ("fromPositionId");
