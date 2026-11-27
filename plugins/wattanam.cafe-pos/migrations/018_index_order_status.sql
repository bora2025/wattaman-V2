-- wattanam-plugin-migration: 018_index_order_status
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_order_status ON plugin_wattanam_cafe_pos_order ("status", "createdAt");
