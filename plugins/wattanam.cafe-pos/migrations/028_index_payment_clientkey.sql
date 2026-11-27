-- wattanam-plugin-migration: 028_index_payment_clientkey
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_payment_clientkey ON plugin_wattanam_cafe_pos_payment ("clientKey") WHERE "clientKey" IS NOT NULL;
