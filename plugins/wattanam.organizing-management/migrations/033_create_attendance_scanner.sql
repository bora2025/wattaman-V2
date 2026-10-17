-- wattanam-plugin-migration: 033_create_attendance_scanner
CREATE INDEX plugin_wattanam_organizing_management_scan_employee_idx ON plugin_wattanam_organizing_management_scan_attempt("employeeId", "receivedAt");
