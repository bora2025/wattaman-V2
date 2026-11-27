-- wattanam-plugin-migration: 001_create_category
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_category (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "nameKh" TEXT,
  "color" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
