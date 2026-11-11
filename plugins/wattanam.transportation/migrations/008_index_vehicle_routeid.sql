-- wattanam-plugin-migration: 008_index_vehicle_routeid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_transportation_vehicle_routeid_idx ON plugin_wattanam_transportation_vehicle ("routeId");
