-- wattanam-plugin-migration: 058_calculate_audit_ready_payroll
CREATE OR REPLACE FUNCTION plugin_wattanam_organizing_management_apply_payroll_permissions()
RETURNS TRIGGER AS $$
DECLARE
  configured_work_days JSONB;
  organization_timezone TEXT;
  expected_days INTEGER := 0;
  present_days INTEGER := 0;
  late_days INTEGER := 0;
  approved_leave_days INTEGER := 0;
  paid_leave_days INTEGER := 0;
  approved_permission_days INTEGER := 0;
  calculated_absent_days INTEGER := 0;
  employee_salary_basis TEXT;
  employee_base_salary INTEGER;
BEGIN
  IF TG_OP<>'INSERT' AND NEW."status"<>OLD."status" THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE("workDays", '[1,2,3,4,5]'::jsonb) INTO configured_work_days
  FROM plugin_wattanam_organizing_management_attendance_setting ORDER BY "updatedAt" DESC LIMIT 1;
  configured_work_days := COALESCE(configured_work_days, '[1,2,3,4,5]'::jsonb);
  SELECT COALESCE("timezone", 'Asia/Phnom_Penh') INTO organization_timezone
  FROM plugin_wattanam_organizing_management_organization_profile ORDER BY "updatedAt" DESC LIMIT 1;
  organization_timezone := COALESCE(organization_timezone, 'Asia/Phnom_Penh');

  WITH period_days AS (
    SELECT day::date AS work_date FROM generate_series(NEW."periodStart", NEW."periodEnd", INTERVAL '1 day') day
    WHERE EXTRACT(ISODOW FROM day)::integer IN (SELECT value::integer FROM jsonb_array_elements_text(configured_work_days))
  ), expected AS (
    SELECT work_date FROM period_days d WHERE NOT EXISTS (
      SELECT 1 FROM plugin_wattanam_organizing_management_calendar_event c
      WHERE c."eventType"='HOLIDAY' AND d.work_date BETWEEN (c."startsAt" AT TIME ZONE organization_timezone)::date AND (COALESCE(c."endsAt",c."startsAt") AT TIME ZONE organization_timezone)::date
    )
  )
  SELECT COUNT(*)::integer,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM plugin_wattanam_organizing_management_attendance_record a WHERE a."employeeId"=NEW."employeeId" AND a."attendanceDate"=e.work_date AND a."status"='PRESENT'))::integer,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM plugin_wattanam_organizing_management_attendance_record a WHERE a."employeeId"=NEW."employeeId" AND a."attendanceDate"=e.work_date AND a."status"='LATE'))::integer,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM plugin_wattanam_organizing_management_day_off_request d WHERE d."employeeId"=NEW."employeeId" AND d."status"='APPROVED' AND e.work_date BETWEEN d."startsOn" AND d."endsOn"))::integer,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM plugin_wattanam_organizing_management_day_off_request d WHERE d."employeeId"=NEW."employeeId" AND d."status"='APPROVED' AND d."leaveType"<>'UNPAID' AND e.work_date BETWEEN d."startsOn" AND d."endsOn"))::integer,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM plugin_wattanam_organizing_management_permission_request p WHERE p."employeeId"=NEW."employeeId" AND p."status"='APPROVED' AND p."permissionDate"=e.work_date) AND NOT EXISTS (SELECT 1 FROM plugin_wattanam_organizing_management_day_off_request d WHERE d."employeeId"=NEW."employeeId" AND d."status"='APPROVED' AND e.work_date BETWEEN d."startsOn" AND d."endsOn"))::integer
  INTO expected_days,present_days,late_days,approved_leave_days,paid_leave_days,approved_permission_days FROM expected e;

  calculated_absent_days := GREATEST(0,expected_days-present_days-late_days-approved_leave_days-approved_permission_days);
  NEW."attendanceDays":=expected_days; NEW."presentDays":=present_days; NEW."lateDays":=late_days;
  NEW."leaveDays":=approved_leave_days; NEW."permissionDays":=approved_permission_days; NEW."absentDays":=calculated_absent_days;
  SELECT "salaryBasis","baseSalaryMinor" INTO employee_salary_basis,employee_base_salary FROM plugin_wattanam_organizing_management_employee WHERE "id"=NEW."employeeId";
  IF employee_salary_basis='MONTHLY' AND expected_days>0 THEN
    NEW."basePayMinor":=employee_base_salary;
    NEW."attendanceDeductionMinor":=ROUND(employee_base_salary::numeric*calculated_absent_days/expected_days)::integer;
  ELSIF employee_salary_basis='DAILY' THEN
    NEW."basePayMinor":=employee_base_salary*(present_days+late_days+paid_leave_days+approved_permission_days);
    NEW."attendanceDeductionMinor":=0;
  ELSE
    NEW."attendanceDeductionMinor":=0;
  END IF;
  NEW."grossPayMinor":=NEW."basePayMinor"+NEW."earningsMinor"+NEW."allowancesMinor"+NEW."overtimePayMinor"+NEW."bonusesMinor"+NEW."reimbursementsMinor"+NEW."leaveAdjustmentMinor";
  NEW."totalDeductionsMinor":=NEW."attendanceDeductionMinor"+NEW."deductionsMinor"+NEW."retirementContributionMinor"+NEW."insurancePremiumMinor"+NEW."loanRecoveryMinor"+NEW."lossOfPayMinor"+NEW."otherPostTaxDeductionMinor";
  NEW."totalTaxesMinor":=NEW."incomeTaxMinor"+NEW."socialSecurityMinor"+NEW."localTaxMinor";
  NEW."netPayMinor":=GREATEST(0,NEW."grossPayMinor"-NEW."totalDeductionsMinor"-NEW."totalTaxesMinor");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
