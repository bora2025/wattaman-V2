-- wattanam-plugin-migration: 014_index_customer_phone
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_customer_phone ON plugin_wattanam_cafe_pos_customer ("phone") WHERE "phone" IS NOT NULL;
