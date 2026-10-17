-- wattanam-plugin-migration: 020_create_payroll_rewards_permissions
CREATE INDEX plugin_wattanam_organizing_management_payroll_period_idx ON plugin_wattanam_organizing_management_payroll_record("periodStart", "periodEnd", "status");
