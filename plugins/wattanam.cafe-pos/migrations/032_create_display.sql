-- wattanam-plugin-migration: 032_create_display
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_display (
  "register" TEXT PRIMARY KEY,
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
