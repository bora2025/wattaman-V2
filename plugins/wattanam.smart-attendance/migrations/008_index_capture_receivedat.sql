-- wattanam-plugin-migration: 008_index_capture_receivedat
CREATE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_capture_receivedat ON plugin_wattanam_smart_attendance_capture ("receivedAt" DESC);
