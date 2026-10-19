-- wattanam-plugin-migration: 064_backfill_salary_configuration_state
UPDATE plugin_wattanam_organizing_management_employee
SET "salaryConfigured" = TRUE
WHERE "baseSalaryMinor" > 0;
