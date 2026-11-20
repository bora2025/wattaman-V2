-- wattanam-plugin-migration: 016_add_station_terminal
ALTER TABLE plugin_wattanam_smart_attendance_station
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'STATION' CHECK ("kind" IN ('STATION', 'TERMINAL')),
  ADD COLUMN IF NOT EXISTS "credentialId" TEXT;
