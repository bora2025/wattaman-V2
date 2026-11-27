-- wattanam-plugin-migration: 009_index_addon_group
CREATE INDEX IF NOT EXISTS plugin_wattanam_cafe_pos_addon_group_id ON plugin_wattanam_cafe_pos_addon ("groupId");
