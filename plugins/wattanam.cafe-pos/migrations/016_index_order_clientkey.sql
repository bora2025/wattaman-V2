-- wattanam-plugin-migration: 016_index_order_clientkey
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_order_clientkey ON plugin_wattanam_cafe_pos_order ("clientKey") WHERE "clientKey" IS NOT NULL;
