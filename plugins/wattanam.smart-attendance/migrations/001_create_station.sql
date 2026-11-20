-- wattanam-plugin-migration: 001_create_station
CREATE TABLE IF NOT EXISTS plugin_wattanam_smart_attendance_station (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "place" TEXT,
  "deviceIdHash" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'ACTIVE', 'REVOKED')),
  "mode" TEXT NOT NULL DEFAULT 'AUTO' CHECK ("mode" IN ('AUTO', 'CHECK_IN', 'CHECK_OUT')),
  "methods" JSONB NOT NULL DEFAULT '["QR", "NFC"]'::jsonb,
  "classIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "requestedBy" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "lastSeenAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
