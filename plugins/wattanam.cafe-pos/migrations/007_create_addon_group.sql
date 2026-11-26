-- wattanam-plugin-migration: 007_create_addon_group
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_addon_group (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "nameKh" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT FALSE,
  "minSelect" INTEGER NOT NULL DEFAULT 0,
  "maxSelect" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
