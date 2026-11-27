-- wattanam-plugin-migration: 005_create_variant
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_variant (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKh" TEXT,
  "price" BIGINT NOT NULL DEFAULT 0 CHECK ("price" >= 0),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);
