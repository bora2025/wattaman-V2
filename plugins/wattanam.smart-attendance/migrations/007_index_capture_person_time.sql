-- wattanam-plugin-migration: 007_index_capture_person_time
CREATE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_capture_person_time ON plugin_wattanam_smart_attendance_capture ("personId", "capturedAt" DESC);
