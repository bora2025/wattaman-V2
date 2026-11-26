-- wattanam-plugin-migration: 017_index_order_number
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_order_number ON plugin_wattanam_cafe_pos_order ("businessDate", "number");
