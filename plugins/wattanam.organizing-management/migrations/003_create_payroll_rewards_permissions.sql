-- wattanam-plugin-migration: 003_create_payroll_rewards_permissions
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "baseSalaryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("baseSalaryMinor" >= 0),
  ADD COLUMN "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "salaryBasis" TEXT NOT NULL DEFAULT 'MONTHLY' CHECK ("salaryBasis" IN ('MONTHLY','DAILY','HOURLY'));

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

CREATE TABLE plugin_wattanam_organizing_management_payroll_record (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "currency" TEXT NOT NULL,
  "basePayMinor" INTEGER NOT NULL CHECK ("basePayMinor" >= 0),
  "attendanceDays" INTEGER NOT NULL DEFAULT 0,
  "presentDays" INTEGER NOT NULL DEFAULT 0,
  "lateDays" INTEGER NOT NULL DEFAULT 0,
  "absentDays" INTEGER NOT NULL DEFAULT 0,
  "leaveDays" INTEGER NOT NULL DEFAULT 0,
  "attendanceDeductionMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("attendanceDeductionMinor" >= 0),
  "earningsMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("earningsMinor" >= 0),
  "deductionsMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("deductionsMinor" >= 0),
  "netPayMinor" INTEGER NOT NULL CHECK ("netPayMinor" >= 0),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','APPROVED','PAID','VOID')),
  "calculation" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("employeeId", "periodStart", "periodEnd"),
  CHECK ("periodEnd" >= "periodStart")
);

CREATE TABLE plugin_wattanam_organizing_management_permission_request (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "permissionType" TEXT NOT NULL CHECK ("permissionType" IN ('LATE_ARRIVAL','EARLY_DEPARTURE','SHORT_LEAVE','REMOTE_WORK','OTHER')),
  "permissionDate" DATE NOT NULL,
  "startsAt" TIME,
  "endsAt" TIME,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" >= "startsAt")
);

CREATE INDEX plugin_wattanam_organizing_management_adjustment_employee_date_idx ON plugin_wattanam_organizing_management_compensation_adjustment("employeeId", "effectiveDate");
CREATE INDEX plugin_wattanam_organizing_management_payroll_period_idx ON plugin_wattanam_organizing_management_payroll_record("periodStart", "periodEnd", "status");
CREATE INDEX plugin_wattanam_organizing_management_permission_employee_date_idx ON plugin_wattanam_organizing_management_permission_request("employeeId", "permissionDate", "status");
