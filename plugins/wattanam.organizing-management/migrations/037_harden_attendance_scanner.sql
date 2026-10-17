-- wattanam-plugin-migration: 037_harden_attendance_scanner
CREATE INDEX plugin_wattanam_organizing_management_scan_principal_idx
  ON plugin_wattanam_organizing_management_scan_attempt("principalId", "receivedAt");
