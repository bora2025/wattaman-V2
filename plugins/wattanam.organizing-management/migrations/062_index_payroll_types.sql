-- wattanam-plugin-migration: 062_index_payroll_types
CREATE INDEX plugin_wattanam_organizing_management_employee_payroll_type_idx
  ON plugin_wattanam_organizing_management_employee("payrollTypeId", "employmentStatus");
