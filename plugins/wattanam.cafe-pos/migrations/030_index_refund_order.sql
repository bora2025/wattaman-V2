-- wattanam-plugin-migration: 030_index_refund_order
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_refund_order ON plugin_wattanam_cafe_pos_refund ("orderId");
