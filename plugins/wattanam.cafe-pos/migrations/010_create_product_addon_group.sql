-- wattanam-plugin-migration: 010_create_product_addon_group
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_product_addon_group (
  "productId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  PRIMARY KEY ("productId", "groupId")
);
