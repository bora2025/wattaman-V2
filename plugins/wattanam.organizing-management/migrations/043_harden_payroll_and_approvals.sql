-- wattanam-plugin-migration: 043_harden_payroll_and_approvals
CREATE INDEX plugin_wattanam_organizing_management_permission_reviewer_idx
  ON plugin_wattanam_organizing_management_permission_request("reviewedById", "reviewedAt");
