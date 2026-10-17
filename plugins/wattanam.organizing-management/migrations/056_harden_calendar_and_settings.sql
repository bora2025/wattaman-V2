-- wattanam-plugin-migration: 056_harden_calendar_and_settings
CREATE INDEX plugin_wattanam_organizing_management_calendar_audit_event_idx
  ON plugin_wattanam_organizing_management_calendar_audit("calendarEventId", "createdAt");
