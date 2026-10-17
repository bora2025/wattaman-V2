-- wattanam-plugin-migration: 038_harden_payroll_and_approvals
ALTER TABLE plugin_wattanam_organizing_management_compensation_adjustment
  ADD COLUMN "createdById" TEXT;
