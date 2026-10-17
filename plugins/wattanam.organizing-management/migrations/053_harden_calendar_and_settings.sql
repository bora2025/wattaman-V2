-- wattanam-plugin-migration: 053_harden_calendar_and_settings
ALTER TABLE plugin_wattanam_organizing_management_calendar_event
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT,
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMPTZ;
