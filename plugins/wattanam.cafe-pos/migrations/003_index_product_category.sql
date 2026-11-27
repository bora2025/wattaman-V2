-- wattanam-plugin-migration: 003_index_product_category
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_product_category ON plugin_wattanam_cafe_pos_product ("categoryId");
