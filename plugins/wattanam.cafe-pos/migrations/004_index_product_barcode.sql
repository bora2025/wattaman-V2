-- wattanam-plugin-migration: 004_index_product_barcode
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_product_barcode ON plugin_wattanam_cafe_pos_product ("barcode");
