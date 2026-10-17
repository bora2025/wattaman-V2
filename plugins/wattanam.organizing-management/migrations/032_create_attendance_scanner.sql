-- wattanam-plugin-migration: 032_create_attendance_scanner
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
