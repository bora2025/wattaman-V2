-- wattanam-plugin-migration: 023_index_cash_session_open
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_cash_session_open ON plugin_wattanam_cafe_pos_cash_session ("status") WHERE "status" = 'OPEN';
