-- wattanam-plugin-migration: 040_harden_payroll_and_approvals
ALTER TABLE plugin_wattanam_organizing_management_permission_request
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ;
