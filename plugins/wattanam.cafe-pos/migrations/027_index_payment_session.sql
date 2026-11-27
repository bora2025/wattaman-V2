-- wattanam-plugin-migration: 027_index_payment_session
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_payment_session ON plugin_wattanam_cafe_pos_payment ("sessionId");
