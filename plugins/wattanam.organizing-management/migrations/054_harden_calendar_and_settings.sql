-- wattanam-plugin-migration: 054_harden_calendar_and_settings
CREATE INDEX plugin_wattanam_organizing_management_calendar_active_start_idx
  ON plugin_wattanam_organizing_management_calendar_event("startsAt")
  WHERE "deletedAt" IS NULL;
