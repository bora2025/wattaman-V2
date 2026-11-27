-- wattanam-plugin-migration: 015_index_face_sample_personid
CREATE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_face_sample_personid ON plugin_wattanam_smart_attendance_face_sample ("personId");
