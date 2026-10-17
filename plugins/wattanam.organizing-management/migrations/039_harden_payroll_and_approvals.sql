-- wattanam-plugin-migration: 039_harden_payroll_and_approvals
ALTER TABLE plugin_wattanam_organizing_management_payroll_record
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMPTZ,
  ADD COLUMN "paidById" TEXT,
  ADD COLUMN "paidAt" TIMESTAMPTZ,
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMPTZ,
  ADD COLUMN "statusReason" TEXT;
