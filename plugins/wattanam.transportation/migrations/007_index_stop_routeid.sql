-- wattanam-plugin-migration: 007_index_stop_routeid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_transportation_stop_routeid_idx ON plugin_wattanam_transportation_stop ("routeId");
