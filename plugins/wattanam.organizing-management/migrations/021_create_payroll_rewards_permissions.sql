-- wattanam-plugin-migration: 021_create_payroll_rewards_permissions
CREATE INDEX plugin_wattanam_organizing_management_permission_employee_date_idx ON plugin_wattanam_organizing_management_permission_request("employeeId", "permissionDate", "status");
