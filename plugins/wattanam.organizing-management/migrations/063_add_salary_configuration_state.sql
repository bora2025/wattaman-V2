-- wattanam-plugin-migration: 063_add_salary_configuration_state
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "salaryConfigured" BOOLEAN NOT NULL DEFAULT FALSE;
