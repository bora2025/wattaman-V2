-- wattanam-plugin-migration: 031_create_day_counter
CREATE TABLE IF NOT EXISTS plugin_wattanam_cafe_pos_day_counter (
  "businessDate" DATE PRIMARY KEY,
  "last" INTEGER NOT NULL DEFAULT 0
);
