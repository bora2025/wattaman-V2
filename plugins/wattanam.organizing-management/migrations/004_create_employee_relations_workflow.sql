-- wattanam-plugin-migration: 004_create_employee_relations_workflow
ALTER TABLE plugin_wattanam_organizing_management_payroll_record
  ADD COLUMN "permissionDays" INTEGER NOT NULL DEFAULT 0 CHECK ("permissionDays" >= 0);

CREATE TABLE plugin_wattanam_organizing_management_disciplinary_action (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "actionType" TEXT NOT NULL CHECK ("actionType" IN ('VERBAL_WARNING','WRITTEN_WARNING','FINAL_WARNING','SUSPENSION','TERMINATION_RECOMMENDATION','OTHER')),
  "incidentDate" DATE NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('DRAFT','ACTIVE','RESOLVED','VOID')),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plugin_wattanam_organizing_management_job_promotion (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "fromPositionId" TEXT REFERENCES plugin_wattanam_organizing_management_position("id"),
  "toPositionId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_position("id"),
  "effectiveDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "previousBaseSalaryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("previousBaseSalaryMinor" >= 0),
  "newBaseSalaryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("newBaseSalaryMinor" >= 0),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX plugin_wattanam_organizing_management_disciplinary_employee_idx ON plugin_wattanam_organizing_management_disciplinary_action("employeeId", "incidentDate");
CREATE INDEX plugin_wattanam_organizing_management_promotion_employee_idx ON plugin_wattanam_organizing_management_job_promotion("employeeId", "effectiveDate");

CREATE FUNCTION plugin_wattanam_organizing_management_apply_payroll_permissions()
RETURNS TRIGGER AS $$
DECLARE
  approved_permission_days INTEGER;
  employee_salary_basis TEXT;
  employee_base_salary INTEGER;
BEGIN
  SELECT COUNT(DISTINCT "permissionDate")::INTEGER INTO approved_permission_days
  FROM plugin_wattanam_organizing_management_permission_request
  WHERE "employeeId" = NEW."employeeId"
    AND "status" = 'APPROVED'
    AND "permissionDate" BETWEEN NEW."periodStart" AND NEW."periodEnd";

  NEW."permissionDays" := COALESCE(approved_permission_days, 0);
  NEW."absentDays" := GREATEST(0, NEW."absentDays" - NEW."permissionDays");
  SELECT "salaryBasis", "baseSalaryMinor" INTO employee_salary_basis, employee_base_salary
  FROM plugin_wattanam_organizing_management_employee WHERE "id" = NEW."employeeId";
  IF employee_salary_basis = 'MONTHLY' AND NEW."attendanceDays" > 0 THEN
    NEW."attendanceDeductionMinor" := ROUND(NEW."basePayMinor"::NUMERIC * NEW."absentDays" / NEW."attendanceDays")::INTEGER;
    NEW."netPayMinor" := GREATEST(0, NEW."basePayMinor" + NEW."earningsMinor" - NEW."attendanceDeductionMinor" - NEW."deductionsMinor");
  ELSIF employee_salary_basis = 'DAILY' AND NEW."permissionDays" > 0 THEN
    NEW."basePayMinor" := NEW."basePayMinor" + (employee_base_salary * NEW."permissionDays");
    NEW."netPayMinor" := GREATEST(0, NEW."basePayMinor" + NEW."earningsMinor" - NEW."deductionsMinor");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plugin_wattanam_organizing_management_payroll_permissions_trigger
BEFORE INSERT OR UPDATE ON plugin_wattanam_organizing_management_payroll_record
FOR EACH ROW EXECUTE FUNCTION plugin_wattanam_organizing_management_apply_payroll_permissions();
