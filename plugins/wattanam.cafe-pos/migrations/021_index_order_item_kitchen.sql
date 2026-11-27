-- wattanam-plugin-migration: 021_index_order_item_kitchen
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_order_item_kitchen ON plugin_wattanam_cafe_pos_order_item ("status", "createdAt") WHERE "status" IN ('NEW', 'PREPARING', 'READY');
