-- wattanam-plugin-migration: 046_audit_hr_and_attendance_corrections
ALTER TABLE plugin_wattanam_organizing_management_job_promotion
  ADD COLUMN "createdById" TEXT;
