-- wattanam-plugin-migration: 045_audit_hr_and_attendance_corrections
ALTER TABLE plugin_wattanam_organizing_management_disciplinary_action
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "resolvedById" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMPTZ;
