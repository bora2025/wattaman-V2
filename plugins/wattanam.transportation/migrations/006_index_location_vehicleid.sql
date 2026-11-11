-- wattanam-plugin-migration: 006_index_location_vehicleid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_transportation_location_vehicleid_idx ON plugin_wattanam_transportation_location ("vehicleId");
