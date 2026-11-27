-- wattanam-plugin-migration: 005_create_capture
CREATE TABLE IF NOT EXISTS plugin_wattanam_smart_attendance_capture (
  "id" TEXT PRIMARY KEY,
  "clientKey" TEXT NOT NULL UNIQUE,
  "stationId" TEXT NOT NULL REFERENCES plugin_wattanam_smart_attendance_station("id"),
  "method" TEXT CHECK ("method" IN ('QR', 'NFC')),
  "source" TEXT NOT NULL CHECK ("source" IN ('CAMERA', 'USB')),
  "codeHash" TEXT NOT NULL,
  "personType" TEXT,
  "personId" TEXT,
  "result" TEXT NOT NULL CHECK ("result" IN ('MATCHED', 'UNKNOWN', 'DUPLICATE', 'OUT_OF_SCOPE', 'METHOD_NOT_ALLOWED')),
  "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'RECORDED', 'ALREADY_RECORDED', 'REJECTED', 'NOT_SENT')),
  "attendanceStatus" TEXT,
  "attendanceRecordId" TEXT,
  "session" INTEGER,
  "sessionType" TEXT,
  "reason" TEXT,
  "operatorId" TEXT,
  "capturedAt" TIMESTAMPTZ NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ
);
