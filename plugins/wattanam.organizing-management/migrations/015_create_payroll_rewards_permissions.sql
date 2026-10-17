-- wattanam-plugin-migration: 015_create_payroll_rewards_permissions
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "baseSalaryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("baseSalaryMinor" >= 0),
  ADD COLUMN "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "salaryBasis" TEXT NOT NULL DEFAULT 'MONTHLY' CHECK ("salaryBasis" IN ('MONTHLY','DAILY','HOURLY'));
