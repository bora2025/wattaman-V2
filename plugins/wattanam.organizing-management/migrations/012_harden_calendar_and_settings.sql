-- wattanam-plugin-migration: 012_harden_calendar_and_settings
ALTER TABLE plugin_wattanam_organizing_management_calendar_event
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT,
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMPTZ;

CREATE INDEX plugin_wattanam_organizing_management_calendar_active_start_idx
  ON plugin_wattanam_organizing_management_calendar_event("startsAt")
  WHERE "deletedAt" IS NULL;

CREATE TABLE plugin_wattanam_organizing_management_calendar_audit (
  "id" TEXT PRIMARY KEY,
  "calendarEventId" TEXT NOT NULL,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('UPDATE','DELETE')),
  "previousValue" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX plugin_wattanam_organizing_management_calendar_audit_event_idx
  ON plugin_wattanam_organizing_management_calendar_audit("calendarEventId", "createdAt");
