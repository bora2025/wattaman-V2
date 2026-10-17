-- wattanam-plugin-migration: 042_harden_payroll_and_approvals
CREATE INDEX plugin_wattanam_organizing_management_payroll_audit_record_idx
  ON plugin_wattanam_organizing_management_payroll_audit("payrollId", "createdAt");
