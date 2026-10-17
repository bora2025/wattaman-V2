-- wattanam-plugin-migration: 004_create_organization_foundation
CREATE TABLE plugin_wattanam_organizing_management_calendar_event (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT 'EVENT' CHECK ("eventType" IN ('HOLIDAY','EVENT','PAYDAY','MEETING','REMINDER')),
  "startsAt" TIMESTAMPTZ NOT NULL, "endsAt" TIMESTAMPTZ, "allDay" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
