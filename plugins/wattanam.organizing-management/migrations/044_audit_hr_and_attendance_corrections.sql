-- wattanam-plugin-migration: 044_audit_hr_and_attendance_corrections
ALTER TABLE plugin_wattanam_organizing_management_day_off_request
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ;
