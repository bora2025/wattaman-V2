-- wattanam-plugin-migration: 016_create_payroll_rewards_permissions
CREATE TABLE plugin_wattanam_organizing_management_compensation_adjustment (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "adjustmentType" TEXT NOT NULL CHECK ("adjustmentType" IN ('GOOD_JOB_REWARD','SENIORITY_BONUS','YEAR_END_BONUS','SALARY_DEDUCTION','WAGE_DEDUCTION','OTHER_EARNING','OTHER_DEDUCTION')),
  "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "effectiveDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
