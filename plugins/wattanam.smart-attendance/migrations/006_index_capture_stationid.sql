-- wattanam-plugin-migration: 006_index_capture_stationid
CREATE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_capture_stationid ON plugin_wattanam_smart_attendance_capture ("stationId");
