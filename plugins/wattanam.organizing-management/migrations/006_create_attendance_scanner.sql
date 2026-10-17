-- wattanam-plugin-migration: 006_create_attendance_scanner
ALTER TABLE plugin_wattanam_organizing_management_attendance_setting
  ADD COLUMN "minimumCheckoutMinutes" INTEGER NOT NULL DEFAULT 30 CHECK ("minimumCheckoutMinutes" BETWEEN 1 AND 1440),
  ADD COLUMN "maximumOfflineMinutes" INTEGER NOT NULL DEFAULT 15 CHECK ("maximumOfflineMinutes" BETWEEN 0 AND 1440);

CREATE TABLE plugin_wattanam_organizing_management_scan_attempt (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "qrIdentifier" TEXT NOT NULL,
  "employeeId" TEXT REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "scanMode" TEXT NOT NULL CHECK ("scanMode" IN ('QR_CAMERA','QR_USB')),
  "clientTimestamp" TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('ACCEPTED','REJECTED')),
  "action" TEXT CHECK ("action" IN ('CHECK_IN','CHECK_OUT','NO_CHANGE')),
  "errorCode" TEXT,
  "recordId" TEXT REFERENCES plugin_wattanam_organizing_management_attendance_record("id"),
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION
);

CREATE INDEX plugin_wattanam_organizing_management_scan_employee_idx ON plugin_wattanam_organizing_management_scan_attempt("employeeId", "receivedAt");
CREATE INDEX plugin_wattanam_organizing_management_scan_received_idx ON plugin_wattanam_organizing_management_scan_attempt("receivedAt");
