-- wattanam-plugin-migration: 027_create_employee_relations_workflow
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
