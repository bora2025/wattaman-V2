-- wattanam-plugin-migration: 055_harden_calendar_and_settings
CREATE TABLE plugin_wattanam_organizing_management_calendar_audit (
  "id" TEXT PRIMARY KEY,
  "calendarEventId" TEXT NOT NULL,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('UPDATE','DELETE')),
  "previousValue" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
