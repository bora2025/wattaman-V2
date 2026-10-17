-- wattanam-plugin-migration: 041_harden_payroll_and_approvals
CREATE TABLE plugin_wattanam_organizing_management_payroll_audit (
  "id" TEXT PRIMARY KEY,
  "payrollId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_payroll_record("id") ON DELETE CASCADE,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL CHECK ("toStatus" IN ('DRAFT','APPROVED','PAID','VOID')),
  "actorId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
