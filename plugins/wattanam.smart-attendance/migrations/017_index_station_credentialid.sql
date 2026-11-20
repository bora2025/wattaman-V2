-- wattanam-plugin-migration: 017_index_station_credentialid
CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_smart_attendance_station_credentialid ON plugin_wattanam_smart_attendance_station ("credentialId") WHERE "credentialId" IS NOT NULL;
