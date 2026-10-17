-- wattanam-plugin-migration: 017_create_payroll_rewards_permissions
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
