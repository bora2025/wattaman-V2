-- wattanam-plugin-migration: 035_index_recipe_item_product
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_recipe_item_product ON plugin_wattanam_cafe_pos_recipe_item ("productId");
