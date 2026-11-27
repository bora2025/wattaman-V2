-- wattanam-plugin-migration: 012_create_kitchen_station
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_kitchen_station (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "categoryIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);
