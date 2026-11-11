-- wattanam-plugin-migration: 067_index_job_promotion_topositionid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_organizing_management_job_promotio_e292aa01_idx ON plugin_wattanam_organizing_management_job_promotion ("toPositionId");
