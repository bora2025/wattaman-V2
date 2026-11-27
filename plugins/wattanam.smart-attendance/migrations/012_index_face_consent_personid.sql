-- wattanam-plugin-migration: 012_index_face_consent_personid
CREATE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_face_consent_personid ON plugin_wattanam_smart_attendance_face_consent ("personId");
