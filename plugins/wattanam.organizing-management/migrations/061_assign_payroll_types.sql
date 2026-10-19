-- wattanam-plugin-migration: 061_assign_payroll_types
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "payrollTypeId" TEXT REFERENCES plugin_wattanam_organizing_management_payroll_type("id") ON DELETE SET NULL;
