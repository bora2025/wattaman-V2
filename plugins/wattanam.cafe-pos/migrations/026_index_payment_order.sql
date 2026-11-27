-- wattanam-plugin-migration: 026_index_payment_order
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_payment_order ON plugin_wattanam_cafe_pos_payment ("orderId");
