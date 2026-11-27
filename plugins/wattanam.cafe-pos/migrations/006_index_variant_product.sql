-- wattanam-plugin-migration: 006_index_variant_product
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_variant_product ON plugin_wattanam_cafe_pos_variant ("productId");
