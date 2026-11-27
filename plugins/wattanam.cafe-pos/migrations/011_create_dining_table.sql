-- wattanam-plugin-migration: 011_create_dining_table
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_dining_table (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 4,
  "area" TEXT,
  "x" INTEGER NOT NULL DEFAULT 0,
  "y" INTEGER NOT NULL DEFAULT 0,
  "shape" TEXT NOT NULL DEFAULT 'SQUARE' CHECK ("shape" IN ('SQUARE', 'ROUND', 'LONG')),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
