-- wattanam-plugin-migration: 004_index_delivery_outbox_messageid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_communication_delivery_outbox_messageid_idx ON plugin_wattanam_communication_delivery_outbox ("messageId");
