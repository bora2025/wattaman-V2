-- wattanam-plugin-migration: 034_create_recipe_item
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_recipe_item (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "supplyId" TEXT NOT NULL,
  "quantity" NUMERIC(14, 3) NOT NULL CHECK ("quantity" > 0)
);
