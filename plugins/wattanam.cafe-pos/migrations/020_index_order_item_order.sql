-- wattanam-plugin-migration: 020_index_order_item_order
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_order_item_order ON plugin_wattanam_cafe_pos_order_item ("orderId");
