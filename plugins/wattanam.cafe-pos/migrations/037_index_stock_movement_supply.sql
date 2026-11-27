-- wattanam-plugin-migration: 037_index_stock_movement_supply
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_stock_movement_supply ON plugin_wattanam_cafe_pos_stock_movement ("supplyId", "createdAt");
