-- wattanam-plugin-migration: 003_index_card_active_uid
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_card_active_uid ON plugin_wattanam_smart_attendance_card ("uidHmac") WHERE "status" = 'ACTIVE';
