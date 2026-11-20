-- wattanam-plugin-migration: 004_index_card_personid
CREATE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_card_personid ON plugin_wattanam_smart_attendance_card ("personId");
