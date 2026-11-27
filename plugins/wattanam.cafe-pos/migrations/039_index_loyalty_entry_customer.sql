-- wattanam-plugin-migration: 039_index_loyalty_entry_customer
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_loyalty_entry_customer ON plugin_wattanam_cafe_pos_loyalty_entry ("customerId", "createdAt");
