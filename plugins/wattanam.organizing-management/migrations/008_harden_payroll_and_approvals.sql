-- wattanam-plugin-migration: 008_harden_payroll_and_approvals
ALTER TABLE plugin_wattanam_organizing_management_compensation_adjustment
  ADD COLUMN "createdById" TEXT;

ALTER TABLE plugin_wattanam_organizing_management_payroll_record
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMPTZ,
  ADD COLUMN "paidById" TEXT,
  ADD COLUMN "paidAt" TIMESTAMPTZ,
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMPTZ,
  ADD COLUMN "statusReason" TEXT;

ALTER TABLE plugin_wattanam_organizing_management_permission_request
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ;

CREATE TABLE plugin_wattanam_organizing_management_payroll_audit (
  "id" TEXT PRIMARY KEY,
  "payrollId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_payroll_record("id") ON DELETE CASCADE,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL CHECK ("toStatus" IN ('DRAFT','APPROVED','PAID','VOID')),
  "actorId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX plugin_wattanam_organizing_management_payroll_audit_record_idx
  ON plugin_wattanam_organizing_management_payroll_audit("payrollId", "createdAt");

CREATE INDEX plugin_wattanam_organizing_management_permission_reviewer_idx
  ON plugin_wattanam_organizing_management_permission_request("reviewedById", "reviewedAt");
