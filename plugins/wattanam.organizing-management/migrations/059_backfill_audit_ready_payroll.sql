-- wattanam-plugin-migration: 059_backfill_audit_ready_payroll
UPDATE plugin_wattanam_organizing_management_payroll_record
SET "grossPayMinor"="basePayMinor"+"earningsMinor",
    "totalDeductionsMinor"="attendanceDeductionMinor"+"deductionsMinor",
    "totalTaxesMinor"=0
WHERE "grossPayMinor"=0 AND ("basePayMinor">0 OR "earningsMinor">0 OR "deductionsMinor">0 OR "attendanceDeductionMinor">0);
