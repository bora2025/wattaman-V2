-- wattanam-plugin-migration: 014_index_face_sample_consentid
CREATE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_face_sample_consentid ON plugin_wattanam_smart_attendance_face_sample ("consentId");
